/* =====================================================
   EC日次売上報告 半自動化 ブックマークレット v1.0
   仕様書 2026/05/31 準拠
   ===================================================== */

/* 多重読み込み対策: 全体をIIFEで包み、GAS_URL等をグローバルに漏らさない */
(function(){
"use strict";

const GAS_URL = 'https://script.google.com/a/macros/8sigotonin.com/s/AKfycbybMc9I7U_Ddv0b0zaJNYR4IBVxRyfRpYiTD0E93DIpnei9OGEjTC_PxkzNw000Ahn78A/exec';

// ── 定数 ──────────────────────────────────────────────
const STORES = {
     '本店': 'ハチカッテ 八ヶ岳のセレクトショップ',
     '楽天': 'ハチカッテ 楽天市場店',
     'Yahoo': 'ハチカッテ ヤフー店',
     'Amazon': 'ハチカッテ'
};
const INHERIT_STATUSES = [
     '★振分待ち','★入荷待ち','★リゾから発送/移動',
     '★生産者発送待ち','★入金待ち','★店頭受取希望','★予約日付別発送残'
   ];

// ── 日付ユーティリティ ──────────────────────────────
function getYesterday(){
     const d = new Date();
     d.setDate(d.getDate()-1);
     return d;
}
function fmtDate(d){
     return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0');
}
function fmtDateShort(d){
     return (d.getMonth()+1)+'/'+d.getDate();
}
function fmtDateNotion(d){
     return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function parseShipDate(str){
     if(!str) return null;
     const m = str.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
     if(!m) return null;
     return new Date(+m[1], +m[2]-1, +m[3]);
}
function normalizeShipDateStr(str){
     const d = parseShipDate(str);
     if(!d) return str;
     return fmtDate(d);
}

// ── テキスト補正 ─────────────────────────────────────
function fixMemo(s){
     s = s.replace(/[～〜]/g, '-');
     s = s.replace(/(\d+\/\d+)[?？](\d+\/\d+)/g, '$1-$2');
     return s.trim();
}

// ── メモ並び順 ───────────────────────────────────────
function memoSortKey(s){
     if(/^\d/.test(s)) return '0'+s;
     if(/^[A-Za-z]/.test(s)) return '1'+s;
     return '2'+s;
}

// ── Robot-in テーブルパース ──────────────────────────
function parseOrders(){
     const table = document.getElementById('data');
     if(!table) return null;
     const rows = Array.from(table.querySelectorAll('tr'));
     const orderRows = rows.filter(r=>r.cells.length===47);
     const orders = [];
     for(const row of orderRows){
            const c = row.cells;
            const storeRaw = c[2]?.textContent.trim() || '';
            const priceRaw = c[8]?.textContent.trim().replace(/,/g,'') || '0';
            const shipDateRaw = c[9]?.textContent.trim() || '';
            const completeDateRaw = c[22]?.textContent.trim() || '';
            const memoRaw = c[23]?.textContent.trim() || '';
            const memo = fixMemo(memoRaw.replace(/\s*保存\s*$/,'').trim());

       let storeKey = null;
            // Amazon は名前が短いので最後に判定
       const storeOrder = ['本店','楽天','Yahoo','Amazon'];
            for(const key of storeOrder){
                     if(storeRaw === STORES[key] || (key !== 'Amazon' && storeRaw.includes(STORES[key]))){
                                storeKey = key;
                                break;
                     }
            }
            if(!storeKey && storeRaw.includes(STORES['Amazon'])) storeKey = 'Amazon';
            if(!storeKey) continue;

       orders.push({
                storeKey,
                price: parseInt(priceRaw)||0,
                shipDate: normalizeShipDateStr(shipDateRaw),
                hasShipped: completeDateRaw !== '',
                memo: memo
       });
     }
     return orders;
}

// ── 売上集計 ────────────────────────────────────────
function calcSales(orders){
     const sales = {'本店':0,'楽天':0,'Yahoo':0,'Amazon':0};
     for(const o of orders) sales[o.storeKey] += o.price;
     return sales;
}

// ── メモ一覧生成 ─────────────────────────────────────
function buildMemoList(orders){
     const memos = orders.filter(o=>o.memo).map(o=>o.memo);
     const unique = [...new Set(memos)];
     return unique.sort((a,b)=>memoSortKey(a).localeCompare(memoSortKey(b),'ja',{numeric:true}));
}

// ── 発送残振り分け ───────────────────────────────────
function buildShipping(orders, prevText){
     const pending = orders.filter(o=>!o.hasShipped && o.memo);
     const byDate = {};
     const unassigned = [];
     for(const o of pending){
            if(o.shipDate){
                     if(!byDate[o.shipDate]) byDate[o.shipDate]=[];
                     if(!byDate[o.shipDate].includes(o.memo)) byDate[o.shipDate].push(o.memo);
            } else {
                     if(!unassigned.includes(o.memo)) unassigned.push(o.memo);
            }
     }
     const inherited = parseInherited(prevText, orders);
     for(const [status, items] of Object.entries(inherited.statuses)){
            if(status === '★振分待ち'){
                     for(const item of items) if(!unassigned.includes(item)) unassigned.push(item);
            } else if(status.match(/^\d{4}\/\d{2}\/\d{2}$/)){
                     if(!byDate[status]) byDate[status]=[];
                     for(const item of items) if(!byDate[status].includes(item)) byDate[status].push(item);
            } else {
                     if(!inherited._extra) inherited._extra={};
                     if(!inherited._extra[status]) inherited._extra[status]=[];
                     for(const item of items) if(!inherited._extra[status].includes(item)) inherited._extra[status].push(item);
            }
     }
     return {byDate, unassigned, extra: inherited._extra||{}};
}

// ── 前回報告パース ───────────────────────────────────
function parseInherited(text, currentOrders){
     if(!text) return {statuses:{}};
     const statuses = {};
     let currentStatus = null;
     for(const line of text.split('\n')){
            const t = line.trim();
            if(!t) continue;
            const isStatus = INHERIT_STATUSES.includes(t);
            const dateMatchFull = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
            const dateMatchShort = t.match(/^(\d{1,2})\/(\d{1,2})$/);
            if(isStatus){
                     currentStatus = t;
                     if(!statuses[t]) statuses[t]=[];
                     continue;
            }
            if(dateMatchFull){
                     currentStatus = t;
                     if(!statuses[t]) statuses[t]=[];
                     continue;
            }
            if(dateMatchShort){
                     const y = new Date().getFullYear();
                     const mm = String(parseInt(dateMatchShort[1])).padStart(2,'0');
                     const dd = String(parseInt(dateMatchShort[2])).padStart(2,'0');
                     const normalDate = y+'/'+mm+'/'+dd;
                     currentStatus = normalDate;
                     if(!statuses[normalDate]) statuses[normalDate]=[];
                     continue;
            }
            if(currentStatus !== null){
                     const item = fixMemo(t.replace(/^[・\-\s]+/,'').trim());
                     if(item && !statuses[currentStatus].includes(item)){
                                statuses[currentStatus].push(item);
                     }
            }
     }
     return {statuses};
}

// ── Chatwork本文生成 ─────────────────────────────────
function buildChatworkBody(date, sales, memoList, shippingInfo){
     const yd = fmtDateShort(date);
     const total = Object.values(sales).reduce((a,b)=>a+b,0);
     const lines = [];
     lines.push('[toall]');
     lines.push('');
     lines.push('■ EC日次売上報告 '+yd);
     lines.push('');
     lines.push('【売上合計】 '+total.toLocaleString()+'円');
     lines.push('本店：'+sales['本店'].toLocaleString()+'円');
     lines.push('楽天：'+sales['楽天'].toLocaleString()+'円');
     lines.push('Yahoo：'+sales['Yahoo'].toLocaleString()+'円');
     lines.push('Amazon：'+sales['Amazon'].toLocaleString()+'円');
     lines.push('');
     lines.push('【注文件数】 '+memoList.length+'件');
     lines.push('');
     lines.push('【商品内容】');
     for(const m of memoList) lines.push('・'+m);
     lines.push('');
     lines.push('【発送残】');
     const {byDate, unassigned, extra} = shippingInfo;
     if(unassigned.length>0){
            lines.push('★振分待ち');
            for(const m of unassigned) lines.push('・'+m);
     }
     const sortedDates = Object.keys(byDate).sort();
     for(const d of sortedDates){
            lines.push(d);
            for(const m of byDate[d]) lines.push('・'+m);
     }
     for(const [status, items] of Object.entries(extra)){
            lines.push(status);
            for(const m of items) lines.push('・'+m);
     }
     return lines.join('\n');
}

// ── Notion本文生成 ───────────────────────────────────
function buildNotionBody(date, sales, memoList, shippingInfo){
     return buildChatworkBody(date, sales, memoList, shippingInfo).replace('[toall]\n\n','');
}

// ── UI構築 ──────────────────────────────────────────
function buildUI(date, sales, memoList, shippingInfo, chatworkBody, notionBody, currentOrders){
     const existing = document.getElementById('ec-report-panel');
     if(existing) existing.remove();

  const panel = document.createElement('div');
     panel.id = 'ec-report-panel';
     panel.style.cssText = 'position:fixed;top:10px;right:10px;width:620px;max-height:90vh;background:#fff;border:2px solid #333;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:999999;overflow:hidden;display:flex;flex-direction:column;font-size:14px;font-family:sans-serif;';

  const header = document.createElement('div');
     header.style.cssText = 'background:#2c3e50;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;';
     header.innerHTML = '<strong>EC日次売上報告 - '+fmtDateShort(date)+'</strong><button id="ec-close-btn" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">×</button>';
     panel.appendChild(header);

  const tabBar = document.createElement('div');
     tabBar.style.cssText = 'display:flex;background:#ecf0f1;border-bottom:1px solid #ccc;';
     const tabNames = ['店舗別合計','メモ一覧','Chatwork','Notion','前回報告'];
     tabNames.forEach((name,i)=>{
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.dataset.tab = i;
            btn.style.cssText = 'border:none;background:none;padding:8px 10px;cursor:pointer;font-size:12px;border-bottom:2px solid transparent;';
            btn.onclick = ()=>switchTab(i);
            tabBar.appendChild(btn);
     });
     panel.appendChild(tabBar);

  const content = document.createElement('div');
     content.style.cssText = 'flex:1;overflow-y:auto;padding:14px;';
     panel.appendChild(content);

  const footer = document.createElement('div');
     footer.style.cssText = 'padding:10px 14px;border-top:1px solid #ccc;display:flex;gap:8px;flex-wrap:wrap;';
     const btnStyle = 'padding:7px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px;';

  const btnSS = document.createElement('button');
     btnSS.textContent = '📊 スプレッドシート';
     btnSS.style.cssText = btnStyle+'background:#27ae60;color:#fff;';
     btnSS.onclick = ()=>send('sales');
     const btnCW = document.createElement('button');
     btnCW.textContent = '💬 Chatwork';
     btnCW.style.cssText = btnStyle+'background:#e67e22;color:#fff;';
     btnCW.onclick = ()=>send('chatwork');
     const btnNT = document.createElement('button');
     btnNT.textContent = '📝 Notion';
     btnNT.style.cssText = btnStyle+'background:#8e44ad;color:#fff;';
     btnNT.onclick = ()=>send('notion');
     const btnAll = document.createElement('button');
     btnAll.textContent = '🚀 まとめて送信';
     btnAll.style.cssText = btnStyle+'background:#2980b9;color:#fff;font-weight:bold;';
     btnAll.onclick = ()=>send('all');
     footer.appendChild(btnSS);
     footer.appendChild(btnCW);
     footer.appendChild(btnNT);
     footer.appendChild(btnAll);
     panel.appendChild(footer);
     document.body.appendChild(panel);

  let cwBody = chatworkBody;
     let ntBody = notionBody;

  const tabContents = [
         buildSalesHTML(date, sales),
         buildMemoHTML(memoList),
         null,
         null,
         buildPrevReportHTML()
       ];

  function getTabContent(i){
         if(i===2) return buildTextareaHTML('chatwork-body', cwBody);
         if(i===3) return buildTextareaHTML('notion-body', ntBody);
         return tabContents[i];
  }

  function switchTab(idx){
         tabBar.querySelectorAll('button').forEach((b,i)=>{
                  b.style.borderBottom = i===idx ? '2px solid #2980b9' : '2px solid transparent';
                  b.style.fontWeight = i===idx ? 'bold' : 'normal';
         });
         content.innerHTML = getTabContent(idx);
         if(idx===4){
                  document.getElementById('ec-reflect-btn').onclick = reflectPrevReport;
         }
  }
     switchTab(0);
     document.getElementById('ec-close-btn').onclick = ()=>panel.remove();

  function send(type){
         const currentCW = document.getElementById('chatwork-body')?.value || cwBody;
         const currentNT = document.getElementById('notion-body')?.value || ntBody;
         const rawTitle = fmtDate(date);
         const notionTitle = rawTitle.replace(/\/0?(\d+)\/0?(\d+)$/,(m,mo,d)=>'/'+mo+'/'+d);
         const payload = {
                  type,
                  date: fmtDateNotion(date),
                  dateDisplay: fmtDate(date),
                  sales,
                  chatworkBody: currentCW,
                  notionBody: currentNT,
                  notionTitle: notionTitle
         };
         const statusDiv = document.createElement('div');
         statusDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#2c3e50;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000000;';
         statusDiv.textContent = '送信中...';
         document.body.appendChild(statusDiv);
         fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'payload='+encodeURIComponent(JSON.stringify(payload))})
           .then(()=>{
                      statusDiv.textContent = '✅ 送信完了（応答はGASログで確認）';
                      setTimeout(()=>statusDiv.remove(),3000);
           })
           .catch(e=>{
                      statusDiv.style.background = '#c0392b';
                      statusDiv.textContent = '❌ 送信エラー: '+e.message;
                      setTimeout(()=>statusDiv.remove(),5000);
           });
  }

  function reflectPrevReport(){
         const prevText = document.getElementById('prev-report-text')?.value||'';
         const newShipping = buildShipping(currentOrders, prevText);
         cwBody = buildChatworkBody(date, sales, memoList, newShipping);
         ntBody = buildNotionBody(date, sales, memoList, newShipping);
         const statusDiv = document.createElement('div');
         statusDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#27ae60;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000000;';
         statusDiv.textContent = '✅ 前回報告を反映しました';
         document.body.appendChild(statusDiv);
         setTimeout(()=>statusDiv.remove(),2000);
         switchTab(2);
  }
}

function buildSalesHTML(date, sales){
     const total = Object.values(sales).reduce((a,b)=>a+b,0);
     return '<h3 style="margin:0 0 12px">売上集計 - '+fmtDateShort(date)+'</h3><table style="width:100%;border-collapse:collapse;"><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ccc;">店舗</th><th style="text-align:right;padding:6px;border-bottom:1px solid #ccc;">売上</th></tr>'+Object.entries(sales).map(([k,v])=>'<tr><td style="padding:6px;">'+k+'</td><td style="text-align:right;padding:6px;">'+v.toLocaleString()+'円</td></tr>').join('')+'<tr style="font-weight:bold;background:#f5f5f5;"><td style="padding:6px;">合計</td><td style="text-align:right;padding:6px;">'+total.toLocaleString()+'円</td></tr></table>';
}

function buildMemoHTML(memoList){
     if(!memoList.length) return '<p>メモあり注文なし</p>';
     return '<h3 style="margin:0 0 12px">メモ一覧（'+memoList.length+'件）</h3><ol style="margin:0;padding-left:20px;">'+memoList.map(m=>'<li style="padding:4px 0;">'+m+'</li>').join('')+'</ol>';
}

function buildTextareaHTML(id, value){
     return '<textarea id="'+id+'" style="width:100%;height:360px;font-size:13px;font-family:monospace;border:1px solid #ccc;padding:8px;box-sizing:border-box;">'+value.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</textarea>';
}

function buildPrevReportHTML(){
     return '<div><p style="margin:0 0 8px;color:#555;font-size:12px;">昨日のChatworkまたはNotion本文を貼り付けてください（発送残引き継ぎ用）</p><textarea id="prev-report-text" style="width:100%;height:280px;font-size:13px;font-family:monospace;border:1px solid #ccc;padding:8px;box-sizing:border-box;" placeholder="前回の報告本文をここに貼り付け..."></textarea><button id="ec-reflect-btn" style="margin-top:8px;padding:8px 16px;background:#2980b9;color:#fff;border:none;border-radius:4px;cursor:pointer;">前回報告を反映</button></div>';
}

// ── メイン実行 ───────────────────────────────────────
(function(){
     const currentOrders = parseOrders();
     if(!currentOrders){
            alert('Robot-inの受注一覧テーブルが見つかりません。\n検索結果画面で実行してください。');
            return;
     }
     const date = getYesterday();
     const sales = calcSales(currentOrders);
     const memoList = buildMemoList(currentOrders);
     const shippingInfo = buildShipping(currentOrders, '');
     const chatworkBody = buildChatworkBody(date, sales, memoList, shippingInfo);
     const notionBody = buildNotionBody(date, sales, memoList, shippingInfo);
     buildUI(date, sales, memoList, shippingInfo, chatworkBody, notionBody, currentOrders);
})();

})();
