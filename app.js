/**
 * 知財裁判例データベース - メインアプリケーション
 */

// =============================================
// グローバル状態
// =============================================
let allData = [];
let filteredData = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// BM25パラメータ
const BM25_K1 = 1.5;
const BM25_B = 0.75;
let documentLengths = [];
let avgDocLength = 0;
let idfCache = {};
let tokenizedDocs = [];

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        await loadData();
        buildBM25Index();
        setupEventListeners();
        populateFilters();
        applyFiltersAndSearch();
    } catch (error) {
        console.error('初期化エラー:', error);
        showError('データの読み込みに失敗しました。ページをリロードしてください。');
    }
}

// =============================================
// データ読み込み
// =============================================
async function loadData() {
    const response = await fetch('data/metadata.json');
    if (!response.ok) {
        throw new Error('データの読み込みに失敗しました');
    }
    allData = await response.json();
    filteredData = [...allData];

    // 総件数を表示
    document.getElementById('total-count').textContent = `全 ${allData.length.toLocaleString()} 件`;
}

// =============================================
// BM25インデックス構築
// =============================================
function tokenize(text) {
    if (!text) return [];
    // 日本語トークナイズ（簡易版: 文字単位のN-gram + 単語分割）
    // キーワード抽出: ひらがな連続、カタカナ連続、漢字連続、英数字連続
    const tokens = [];
    const regex = /[\u4e00-\u9faf]+|[\u3040-\u309f]+|[\u30a0-\u30ff]+|[a-zA-Z0-9]+/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.push(match[0].toLowerCase());
    }
    return tokens;
}

function buildBM25Index() {
    // 各ドキュメントのテキストをトークナイズ
    tokenizedDocs = allData.map(item => {
        const text = [
            item.hatsumei_meisho || '',
            item.soten || '',
            item.genkoku || '',
            item.hikoku || '',
            item.jiken_shubetsu || '',
            item.kenri_shubetsu || ''
        ].join(' ');
        return tokenize(text);
    });

    // ドキュメント長の計算
    documentLengths = tokenizedDocs.map(tokens => tokens.length);
    avgDocLength = documentLengths.reduce((a, b) => a + b, 0) / documentLengths.length || 1;

    // IDF計算
    const df = {}; // Document frequency
    tokenizedDocs.forEach(tokens => {
        const uniqueTokens = [...new Set(tokens)];
        uniqueTokens.forEach(token => {
            df[token] = (df[token] || 0) + 1;
        });
    });

    const N = allData.length;
    idfCache = {};
    for (const term in df) {
        idfCache[term] = Math.log((N - df[term] + 0.5) / (df[term] + 0.5) + 1);
    }
}

function calculateBM25Score(queryTokens, docIndex) {
    const docTokens = tokenizedDocs[docIndex];
    const docLen = documentLengths[docIndex];

    // 単語頻度カウント
    const tf = {};
    docTokens.forEach(token => {
        tf[token] = (tf[token] || 0) + 1;
    });

    let score = 0;
    queryTokens.forEach(term => {
        const termFreq = tf[term] || 0;
        const idf = idfCache[term] || 0;
        const numerator = termFreq * (BM25_K1 + 1);
        const denominator = termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgDocLength));
        score += idf * (numerator / denominator);
    });

    return score;
}

function findSimilarCases(targetItem, limit = 10) {
    // ターゲットのテキストをトークナイズ
    const text = [
        targetItem.hatsumei_meisho || '',
        targetItem.soten || '',
        targetItem.kenri_shubetsu || ''
    ].join(' ');
    const queryTokens = tokenize(text);

    if (queryTokens.length === 0) {
        return [];
    }

    // 全ドキュメントのスコアを計算
    const scores = allData.map((item, index) => ({
        item,
        score: item.id === targetItem.id ? -1 : calculateBM25Score(queryTokens, index)
    }));

    // スコアでソートして上位を返す
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).filter(s => s.score > 0);
}

// =============================================
// イベントリスナー
// =============================================
function setupEventListeners() {
    // 検索
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            applyFiltersAndSearch();
        }
    });

    searchBtn.addEventListener('click', () => {
        currentPage = 1;
        applyFiltersAndSearch();
    });

    // フィルター
    document.getElementById('filter-kenri').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndSearch();
    });

    document.getElementById('filter-jiken').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndSearch();
    });

    document.getElementById('filter-kekka').addEventListener('change', () => {
        currentPage = 1;
        applyFiltersAndSearch();
    });

    // ソート
    document.getElementById('sort-select').addEventListener('change', () => {
        applyFiltersAndSearch();
    });

    // クリアボタン
    document.getElementById('clear-filters').addEventListener('click', clearFilters);

    // モーダル
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
        if (e.target.id === 'detail-modal') {
            closeModal();
        }
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// =============================================
// フィルター関連
// =============================================
function populateFilters() {
    // 権利種別
    const kenriValues = [...new Set(allData.map(d => d.kenri_shubetsu).filter(v => v))];
    const kenriSelect = document.getElementById('filter-kenri');
    kenriValues.sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        kenriSelect.appendChild(option);
    });

    // 事件種別
    const jikenValues = [...new Set(allData.map(d => d.jiken_shubetsu).filter(v => v))];
    const jikenSelect = document.getElementById('filter-jiken');
    jikenValues.sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        jikenSelect.appendChild(option);
    });

    // 判決結果
    const kekkaValues = [...new Set(allData.map(d => d.hanketsu_kekka).filter(v => v))];
    const kekkaSelect = document.getElementById('filter-kekka');
    kekkaValues.sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        kekkaSelect.appendChild(option);
    });
}

function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-kenri').value = '';
    document.getElementById('filter-jiken').value = '';
    document.getElementById('filter-kekka').value = '';
    currentPage = 1;
    applyFiltersAndSearch();
}

// =============================================
// 検索・フィルタリング
// =============================================
function applyFiltersAndSearch() {
    const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
    const kenriFilter = document.getElementById('filter-kenri').value;
    const jikenFilter = document.getElementById('filter-jiken').value;
    const kekkaFilter = document.getElementById('filter-kekka').value;
    const sortValue = document.getElementById('sort-select').value;

    // フィルタリング
    filteredData = allData.filter(item => {
        // 検索クエリ
        if (searchQuery) {
            const searchFields = [
                item.hatsumei_meisho,
                item.jiken_bango,
                item.genkoku,
                item.hikoku,
                item.soten,
                item.kenri_shubetsu,
                item.jiken_shubetsu
            ].map(f => (f || '').toLowerCase());

            if (!searchFields.some(f => f.includes(searchQuery))) {
                return false;
            }
        }

        // フィルター
        if (kenriFilter && item.kenri_shubetsu !== kenriFilter) return false;
        if (jikenFilter && item.jiken_shubetsu !== jikenFilter) return false;
        if (kekkaFilter && item.hanketsu_kekka !== kekkaFilter) return false;

        return true;
    });

    // ソート
    filteredData.sort((a, b) => {
        const dateA = parseWareki(a.saiban_nengappi);
        const dateB = parseWareki(b.saiban_nengappi);

        if (sortValue === 'date-desc') {
            return dateB - dateA;
        } else {
            return dateA - dateB;
        }
    });

    renderResults();
}

// =============================================
// 和暦パーサー
// =============================================
function parseWareki(warekiStr) {
    if (!warekiStr) return new Date(0);

    const match = warekiStr.match(/(令和|平成|昭和)\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (!match) return new Date(0);

    const era = match[1];
    const year = parseInt(match[2]);
    const month = parseInt(match[3]);
    const day = parseInt(match[4]);

    let westernYear;
    switch (era) {
        case '令和':
            westernYear = 2018 + year;
            break;
        case '平成':
            westernYear = 1988 + year;
            break;
        case '昭和':
            westernYear = 1925 + year;
            break;
        default:
            return new Date(0);
    }

    return new Date(westernYear, month - 1, day);
}

// =============================================
// 結果表示
// =============================================
function renderResults() {
    const container = document.getElementById('results-container');
    const resultsCount = document.getElementById('results-count');

    // 結果件数を更新
    resultsCount.textContent = `検索結果: ${filteredData.length.toLocaleString()}件`;

    // ページネーション計算
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageData = filteredData.slice(startIndex, endIndex);

    // 結果なし
    if (pageData.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <h3>該当する裁判例が見つかりませんでした</h3>
                <p>検索条件を変更してお試しください</p>
            </div>
        `;
        document.getElementById('pagination').innerHTML = '';
        return;
    }

    // カード生成
    container.innerHTML = pageData.map(item => createResultCard(item)).join('');

    // カードクリックイベント
    container.querySelectorAll('.result-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            showDetail(pageData[index]);
        });
    });

    // ページネーション
    renderPagination(totalPages);
}

function createResultCard(item) {
    const title = item.hatsumei_meisho || item.jiken_bango || '（タイトルなし）';
    const truncatedTitle = title.length > 80 ? title.substring(0, 80) + '...' : title;

    return `
        <div class="result-card" data-id="${item.id}">
            <div class="card-header">
                <h3 class="card-title">${escapeHtml(truncatedTitle)}</h3>
                <div class="card-badges">
                    ${item.kenri_shubetsu ? `<span class="badge badge-kenri">${escapeHtml(item.kenri_shubetsu)}</span>` : ''}
                    ${item.hanketsu_kekka ? `<span class="badge badge-kekka">${escapeHtml(item.hanketsu_kekka)}</span>` : ''}
                </div>
            </div>
            <div class="card-meta">
                <div class="meta-item">
                    <span class="meta-label">事件番号:</span>
                    <span>${escapeHtml(item.jiken_bango || '-')}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">裁判日:</span>
                    <span>${escapeHtml(item.saiban_nengappi || '-')}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">部:</span>
                    <span>${escapeHtml(item.bumei || '-')}</span>
                </div>
            </div>
            <div class="card-parties">
                ${item.genkoku ? `<span>原告: ${escapeHtml(truncateText(item.genkoku, 30))}</span>` : ''}
                ${item.hikoku ? `<span>被告: ${escapeHtml(truncateText(item.hikoku, 30))}</span>` : ''}
            </div>
        </div>
    `;
}

// =============================================
// ページネーション
// =============================================
function renderPagination(totalPages) {
    const container = document.getElementById('pagination');

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // 前へ
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">前へ</button>`;

    // ページ番号
    const maxButtons = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span style="color: var(--text-muted); padding: 0 var(--spacing-sm);">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span style="color: var(--text-muted); padding: 0 var(--spacing-sm);">...</span>`;
        }
        html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // 次へ
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">次へ</button>`;

    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================
// 詳細モーダル
// =============================================
function showDetail(item) {
    const modal = document.getElementById('detail-modal');
    const modalBody = document.getElementById('modal-body');

    modalBody.innerHTML = `
        <div class="detail-header">
            <h2 class="detail-title">${escapeHtml(item.hatsumei_meisho || item.jiken_bango || '（タイトルなし）')}</h2>
            <div class="detail-badges">
                ${item.jiken_shubetsu ? `<span class="badge badge-kenri">${escapeHtml(item.jiken_shubetsu)}</span>` : ''}
                ${item.kenri_shubetsu ? `<span class="badge badge-kenri">${escapeHtml(item.kenri_shubetsu)}</span>` : ''}
                ${item.jiken_shurui ? `<span class="badge badge-kenri">${escapeHtml(item.jiken_shurui)}</span>` : ''}
                ${item.hanketsu_kekka ? `<span class="badge badge-kekka">${escapeHtml(item.hanketsu_kekka)}</span>` : ''}
            </div>
        </div>
        
        <div class="detail-section">
            <h3>基本情報</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="label">事件番号</div>
                    <div class="value">${escapeHtml(item.jiken_bango || '-')}</div>
                </div>
                <div class="detail-item">
                    <div class="label">裁判年月日</div>
                    <div class="value">${escapeHtml(item.saiban_nengappi || '-')}</div>
                </div>
                <div class="detail-item">
                    <div class="label">担当部</div>
                    <div class="value">${escapeHtml(item.bumei || '-')}</div>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3>当事者</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="label">原告</div>
                    <div class="value">${escapeHtml(item.genkoku || '-')}</div>
                </div>
                <div class="detail-item">
                    <div class="label">被告</div>
                    <div class="value">${escapeHtml(item.hikoku || '-')}</div>
                </div>
            </div>
        </div>
        
        ${item.soten ? `
        <div class="detail-section">
            <h3>争点</h3>
            <div class="detail-item" style="width: 100%;">
                <div class="value">${escapeHtml(item.soten)}</div>
            </div>
        </div>
        ` : ''}
        
        ${item.pdf_url ? `
        <div class="detail-section">
            <h3>判決文</h3>
            <a href="${escapeHtml(item.pdf_url)}" target="_blank" rel="noopener noreferrer" class="pdf-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                PDFで全文を見る（知財高裁サイト）
            </a>
        </div>
        ` : ''}
        
        <div class="detail-section">
            <h3>類似裁判例</h3>
            <button id="find-similar-btn" class="similar-btn" data-item-id="${item.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                類似裁判例を検索
            </button>
            <div id="similar-results" class="similar-results"></div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 類似検索ボタンのイベント
    document.getElementById('find-similar-btn').addEventListener('click', () => {
        showSimilarCases(item);
    });
}

function showSimilarCases(targetItem) {
    const container = document.getElementById('similar-results');
    const btn = document.getElementById('find-similar-btn');

    // ボタンを無効化
    btn.disabled = true;
    btn.textContent = '検索中...';

    // 少し遅延を入れてUIを更新
    setTimeout(() => {
        const similar = findSimilarCases(targetItem, 5);

        if (similar.length === 0) {
            container.innerHTML = '<p class="no-similar">類似する裁判例が見つかりませんでした</p>';
        } else {
            container.innerHTML = similar.map(({ item, score }) => `
                <div class="similar-card" onclick="openSimilarCase(${item.id})">
                    <div class="similar-title">${escapeHtml(truncateText(item.hatsumei_meisho || item.jiken_bango, 60))}</div>
                    <div class="similar-meta">
                        <span>${escapeHtml(item.jiken_bango || '')}</span>
                        <span>${escapeHtml(item.saiban_nengappi || '')}</span>
                        <span class="similar-score">類似度: ${(score * 10).toFixed(1)}</span>
                    </div>
                </div>
            `).join('');
        }

        btn.disabled = false;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
            再検索
        `;
    }, 100);
}

function openSimilarCase(itemId) {
    const item = allData.find(d => d.id === itemId);
    if (item) {
        showDetail(item);
    }
}

function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// =============================================
// ユーティリティ
// =============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function showError(message) {
    const container = document.getElementById('results-container');
    container.innerHTML = `
        <div class="no-results">
            <h3>エラー</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}
