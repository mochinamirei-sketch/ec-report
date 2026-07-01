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
const SHIP_CATEGORIES = ['振分待ち','入荷待ち','リゾから発送/移動','生産者発送待ち','入金待ち','店頭受取希望','予約'];

/* 固定テンプレ（月別売上実績＋各種URL）：内容を更新するときはこの定数だけ編集すればよい */
const FIXED_TEMPLATE = `2020年度
・6月の発送済み売上実績：370 153
・7月の発送済み売上実績：5 037 976
・8月の発送済み売上実績：7 675 632
・9月の発送済み売上実績：1 257 679
・10月の発送済み売上実績：251 869(20%/50 374)
・11月の発送済み売上実績：306 675(20%/61 335)
・12月の発送済み売上実績：647 884(20%/129 577)
・1月の発送済み：302 370(20%/60 474)
・2月の発送済み：291 218a(20%/58 244)
・3月の発送済み：338 502(20%/67 700)
・4月の発送済み：370 948(20%/74 190)
・5月の発送済み：384 404(20%/76 881)
・6月の発送済み：502 604(20%/100 521)

2025年売上実績
https://docs.google.com/spreadsheets/d/1gayjtM3Hv4HbcWaVAaMsvJCFUGnd8Lz-Gb49iuW3Mgk/edit?gid=819586888#gid=819586888

2026年もろこし予約管理
https://docs.google.com/spreadsheets/d/1sGQAY4FApAvHNI6pKmuyLeT-yBqTso5CCr5FL5aAz_E/edit?usp=sharing

2024年売上実績
https://docs.google.com/spreadsheets/d/1gayjtM3Hv4HbcWaVAaMsvJCFUGnd8Lz-Gb49iuW3Mgk/edit?gid=1550105178#gid=1550105178

2023年売上実績
https://docs.google.com/spreadsheets/d/1gayjtM3Hv4HbcWaVAaMsvJCFUGnd8Lz-Gb49iuW3Mgk/edit#gid=982607527

2022年度売上＆利益
https://docs.google.com/spreadsheets/d/1gayjtM3Hv4HbcWaVAaMsvJCFUGnd8Lz-Gb49iuW3Mgk/edit#gid=0

2023年売上目標＆実績＆各種マネージメントデータ
https://docs.google.com/spreadsheets/d/1gayjtM3Hv4HbcWaVAaMsvJCFUGnd8Lz-Gb49iuW3Mgk/edit?usp=sharing`;

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

// ── 発送実績: 「請求金額」列を合計 ──────────────────────
function sumBillingAmount(){
     const table = document.getElementById('data');
     if(!table) return null;
     const rows = Array.from(table.querySelectorAll('tr'));
     // ヘッダー行から「請求金額」を含む列の位置を特定
     let billIdx = -1;
     for(const r of rows){
            const cells = Array.from(r.cells);
            for(let i=0;i<cells.length;i++){
                     if(cells[i].textContent.trim().indexOf('請求金額') >= 0){ billIdx = i; break; }
            }
            if(billIdx >= 0) break;
     }
     if(billIdx < 0) return null; // 「請求金額」列が見つからない
     // 注文行（47セル）のその列を合計（カンマ等は除去、数字とマイナスのみ）
     const orderRows = rows.filter(r=>r.cells.length===47);
     let total = 0, count = 0;
     for(const r of orderRows){
            const raw = (r.cells[billIdx]?.textContent || '').replace(/[^0-9\-]/g,'');
            if(raw === '' || raw === '-') continue;
            total += parseInt(raw,10) || 0;
            count++;
     }
     return { total: total, count: count, columnIndex: billIdx };
}

// ── 発送実績を当日の行へ送信 ──────────────────────────
function sendShipping(){
     const billing = sumBillingAmount();
     if(billing === null){
            alert('「請求金額」列が見つかりませんでした。\nRobot-inの受注一覧画面で実行してください。');
            return;
     }
     const today = new Date();
     const ok = confirm(
            '発送実績を送信します。\n\n'+
            '対象日：'+fmtDateShort(today)+'（当日）\n'+
            '請求金額合計：'+billing.total.toLocaleString()+'円\n'+
            '対象件数：'+billing.count+'件\n\n'+
            'この金額を'+fmtDateShort(today)+'の発送B（Q列）に書き込みます。よろしいですか？'
     );
     if(!ok) return;
     const payload = {
            type: 'shipping',
            date: fmtDateNotion(today),
            dateDisplay: fmtDate(today),
            shippingAmount: billing.total
     };
     const statusDiv = document.createElement('div');
     statusDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#2c3e50;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000000;';
     statusDiv.textContent = '発送実績を送信中...';
     document.body.appendChild(statusDiv);
     fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'payload='+encodeURIComponent(JSON.stringify(payload))})
       .then(()=>{
              statusDiv.textContent = '✅ 発送実績を送信（応答はGASログで確認）';
              setTimeout(()=>statusDiv.remove(),3000);
       })
       .catch(e=>{
              statusDiv.style.background = '#c0392b';
              statusDiv.textContent = '❌ 送信エラー: '+e.message;
              setTimeout(()=>statusDiv.remove(),5000);
       });
}

// ── CSV発送実績（繁忙期用） ─────────────────────────────
// Shift-JISのArrayBufferを文字列にデコード
function decodeShiftJIS(buffer){
     try{
            return new TextDecoder('shift_jis').decode(buffer);
     }catch(e){
            // 一部環境向けフォールバック
            return new TextDecoder('shift-jis').decode(buffer);
     }
}

// CSVを行×列の二次元配列にパース（ダブルクォート対応の簡易版）
function parseCSV(text){
     text = text.replace(/^\uFEFF/,''); // BOM除去
     const rows=[]; let row=[]; let field=''; let inQ=false;
     for(let i=0;i<text.length;i++){
            const ch=text[i];
            if(inQ){
                     if(ch==='"'){
                                if(text[i+1]==='"'){ field+='"'; i++; }
                                else inQ=false;
                     } else field+=ch;
            } else {
                     if(ch==='"') inQ=true;
                     else if(ch===','){ row.push(field); field=''; }
                     else if(ch==='\r'){ /* skip */ }
                     else if(ch==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
                     else field+=ch;
            }
     }
     if(field!=='' || row.length>0){ row.push(field); rows.push(row); }
     return rows.filter(r=>r.length>1 || (r.length===1 && r[0].trim()!==''));
}

function csvNum(s){
     s=String(s||'').trim().replace(/,/g,'');
     if(s===''||s==='-') return 0;
     const v=parseFloat(s);
     return isNaN(v)?0:v;
}

// 出荷完了日などを m/d に正規化（2026-07-01 / 2026/07/01 / 7/1 対応）
function csvNormDate(s){
     s=String(s||'').trim();
     let m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
     if(m) return Number(m[2])+'/'+Number(m[3]);
     m=s.match(/(\d{1,2})\/(\d{1,2})/);
     if(m) return Number(m[1])+'/'+Number(m[2]);
     return s;
}

// CSVテキストから「今日出荷完了ぶん」の発送実績合計を計算
function calcShippingFromCSV(csvText){
     const rows=parseCSV(csvText);
     if(rows.length<2) return {error:'CSVにデータ行がありません'};
     const hdr=rows[0].map(h=>h.trim());
     const idx={};
     hdr.forEach((h,i)=>{ idx[h]=i; });
     const need=['受注番号','項番','出荷完了日','数量','単価','送料','手数料','利用ポイント','割引金額'];
     for(const c of need){
            if(!(c in idx)) return {error:'必要な列が見つかりません: '+c};
     }
     const data=rows.slice(1);
     // 受注番号ごとの行数＝項番数
     const cnt={};
     for(const r of data){
            const no=(r[idx['受注番号']]||'').trim();
            if(!no) continue;
            cnt[no]=(cnt[no]||0)+1;
     }
     const today=fmtDateShort(new Date()); // m/d
     let total=0, count=0;
     const detail=[];
     for(const r of data){
            const done=csvNormDate(r[idx['出荷完了日']]);
            if(done!==today) continue; // パソコンの今日と一致する出荷完了日だけ
            const no=(r[idx['受注番号']]||'').trim();
            const n=cnt[no]||1; // 項番数
            const val = csvNum(r[idx['単価']])*csvNum(r[idx['数量']])
                              + (csvNum(r[idx['送料']])/n)
                              + (csvNum(r[idx['手数料']])/n)
                              - (csvNum(r[idx['利用ポイント']])/n)
                              - (csvNum(r[idx['割引金額']])/n);
            const rounded=Math.round(val); // 四捨五入
            total+=rounded; count++;
            detail.push({no:no, koban:(r[idx['項番']]||'').trim(), n:n, amount:rounded});
     }
     return {today:today, total:total, count:count, detail:detail};
}

// CSV専用パネルを表示
function openCSVPanel(){
     const old=document.getElementById('ec-csv-panel');
     if(old) old.remove();
     const panel=document.createElement('div');
     panel.id='ec-csv-panel';
     panel.style.cssText='position:fixed;top:60px;right:20px;width:420px;max-height:80vh;overflow:auto;background:#fff;border:2px solid #16a085;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:1000001;font-family:sans-serif;';
     panel.innerHTML=''
        +'<div style="background:#16a085;color:#fff;padding:10px 14px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">'
        +'<span>📄 CSVから発送実績</span><span id="ec-csv-close" style="cursor:pointer;font-size:18px;">×</span></div>'
        +'<div style="padding:14px;">'
        +'<p style="margin:0 0 8px;font-size:12px;color:#555;">その日に出荷したぶんのCSVをアップロードしてください。<br>パソコンの今日の日付と「出荷完了日」が一致する行だけを計算し、今日の行のQ列（発送B）へ送信します。</p>'
        +'<input type="file" id="ec-csv-file" accept=".csv" style="margin:6px 0;font-size:13px;">'
        +'<div id="ec-csv-result" style="margin-top:10px;font-size:13px;"></div>'
        +'<button id="ec-csv-send" style="display:none;margin-top:10px;padding:8px 16px;background:#16a085;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">この金額を送信</button>'
        +'</div>';
     document.body.appendChild(panel);
     document.getElementById('ec-csv-close').onclick=()=>panel.remove();

     let calc=null;
     document.getElementById('ec-csv-file').onchange=function(ev){
            const file=ev.target.files[0];
            if(!file) return;
            const reader=new FileReader();
            reader.onload=function(){
                     const text=decodeShiftJIS(reader.result);
                     calc=calcShippingFromCSV(text);
                     const box=document.getElementById('ec-csv-result');
                     const btn=document.getElementById('ec-csv-send');
                     if(calc.error){
                                box.innerHTML='<span style="color:#c0392b;">エラー: '+calc.error+'</span>';
                                btn.style.display='none';
                                return;
                     }
                     if(calc.count===0){
                                box.innerHTML='<span style="color:#c0392b;">今日（'+calc.today+'）出荷完了の行がCSVにありませんでした。</span>';
                                btn.style.display='none';
                                return;
                     }
                     let html='<div style="border:1px solid #ddd;border-radius:4px;padding:8px;">'
                        +'<div style="font-weight:bold;margin-bottom:6px;">対象日: '+calc.today+'（当日出荷完了ぶん）</div>'
                        +'<div style="font-size:16px;color:#16a085;font-weight:bold;">合計 '+calc.total.toLocaleString()+'円（'+calc.count+'件）</div>'
                        +'<div style="margin-top:6px;font-size:11px;color:#777;max-height:150px;overflow:auto;">';
                     calc.detail.forEach(d=>{ html+='受注'+d.no+' 項番'+d.koban+'（÷'+d.n+'）→ '+d.amount.toLocaleString()+'円<br>'; });
                     html+='</div></div>';
                     box.innerHTML=html;
                     btn.style.display='inline-block';
            };
            reader.readAsArrayBuffer(file); // Shift-JIS対応のためArrayBufferで読む
     };

     document.getElementById('ec-csv-send').onclick=function(){
            if(!calc || calc.count===0) return;
            if(!confirm('発送実績を送信します。\n\n対象日: '+calc.today+'\n合計: '+calc.total.toLocaleString()+'円（'+calc.count+'件）\n\n'+calc.today+'の発送B（Q列）に書き込みます。よろしいですか？')) return;
            const today=new Date();
            const payload={ type:'shipping', date:fmtDateNotion(today), dateDisplay:fmtDate(today), shippingAmount:calc.total };
            const statusDiv=document.createElement('div');
            statusDiv.style.cssText='position:fixed;bottom:20px;right:20px;background:#2c3e50;color:#fff;padding:10px 16px;border-radius:6px;z-index:1000002;';
            statusDiv.textContent='CSV発送実績を送信中...';
            document.body.appendChild(statusDiv);
            fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'payload='+encodeURIComponent(JSON.stringify(payload))})
              .then(()=>{ statusDiv.textContent='✅ CSV発送実績を送信（GASログで確認）'; setTimeout(()=>statusDiv.remove(),3000); })
              .catch(e=>{ statusDiv.style.background='#c0392b'; statusDiv.textContent='❌ 送信エラー: '+e.message; setTimeout(()=>statusDiv.remove(),5000); });
     };
}

// ── 売上集計 ────────────────────────────────────────
function calcSales(orders){
     const sales = {'本店':0,'楽天':0,'Yahoo':0,'Amazon':0};
     for(const o of orders) sales[o.storeKey] += o.price;
     return sales;
}

// ── メモ一覧生成 ─────────────────────────────────────
function buildMemoList(orders){
     // 空メモは除外・重複はまとめない・従来どおりソート（同じメモは隣接）
     const memos = orders.filter(o=>o.memo).map(o=>o.memo);
     return memos.sort((a,b)=>memoSortKey(a).localeCompare(memoSortKey(b),'ja',{numeric:true}));
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
            if(status === '振分待ち'){
                     for(const item of items) if(!unassigned.includes(item)) unassigned.push(item);
            } else if(status.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)){
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
            if(t === '---発送残の部---') continue; // 新形式の区切り行はスキップ
            // カテゴリ見出し判定：「## 予約」「★予約」どちらの形式でも、
            // 先頭の「## 」または「★」を外した名前が既定カテゴリなら見出しとみなす。
            // （商品名が「★複数注意…」で始まっても、外した残りはカテゴリ名と一致しないので誤判定しない）
            const catName = t.replace(/^##\s+/,'').replace(/^★/,'').trim();
            const isCat = (t.startsWith('##') || t.startsWith('★')) && SHIP_CATEGORIES.includes(catName);
            const dateMatchFull = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
            const dateMatchShort = t.match(/^(\d{1,2})\/(\d{1,2})$/);
            if(isCat){
                     currentStatus = catName;
                     if(!statuses[catName]) statuses[catName]=[];
                     continue;
            }
            if(dateMatchFull){
                     const key = fmtDate(new Date(+dateMatchFull[1], +dateMatchFull[2]-1, +dateMatchFull[3]));
                     currentStatus = key;
                     if(!statuses[key]) statuses[key]=[];
                     continue;
            }
            if(dateMatchShort){
                     const key = fmtDate(new Date(new Date().getFullYear(), +dateMatchShort[1]-1, +dateMatchShort[2]));
                     currentStatus = key;
                     if(!statuses[key]) statuses[key]=[];
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
     const L = [];
     L.push('[toall]');
     L.push('■ EC日次売上報告 '+yd);
     L.push('');
     L.push('【売上合計】 '+total.toLocaleString()+'円');
     L.push('本店：'+sales['本店'].toLocaleString()+'円');
     L.push('楽天：'+sales['楽天'].toLocaleString()+'円');
     L.push('Yahoo：'+sales['Yahoo'].toLocaleString()+'円');
     L.push('Amazon：'+sales['Amazon'].toLocaleString()+'円');
     L.push('');
     L.push('【注文件数】 '+memoList.length+'件');
     L.push('');
     L.push('【注文商品内容】');
     for(const m of memoList) L.push(m);
     L.push('');
     L.push(FIXED_TEMPLATE);
     L.push('');
     L.push('---発送残の部---');
     L.push('');
     const {byDate, unassigned, extra} = shippingInfo;
     const catItems = {
            '振分待ち': unassigned,
            '入荷待ち': extra['入荷待ち'] || [],
            'リゾから発送/移動': extra['リゾから発送/移動'] || [],
            '生産者発送待ち': extra['生産者発送待ち'] || [],
            '入金待ち': extra['入金待ち'] || [],
            '店頭受取希望': extra['店頭受取希望'] || [],
            '予約': extra['予約'] || []
     };
     for(const cat of SHIP_CATEGORIES){
            L.push('## '+cat);
            for(const m of (catItems[cat] || [])) L.push(m);
            L.push('');
     }
     const sortedDates = Object.keys(byDate).sort();
     for(const d of sortedDates){
            L.push(d);
            for(const m of byDate[d]) L.push(m);
            L.push('');
     }
     return L.join('\n').replace(/\n+$/,'');
}

// ── Notion本文生成 ───────────────────────────────────
function buildNotionBody(date, sales, memoList, shippingInfo){
     return buildChatworkBody(date, sales, memoList, shippingInfo).replace(/^\[toall\]\n/,'');
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
     const btnShip = document.createElement('button');
     btnShip.textContent = '🚚 発送実績を送信';
     btnShip.style.cssText = btnStyle+'background:#16a085;color:#fff;';
     btnShip.onclick = ()=>sendShipping();
     const btnCSV = document.createElement('button');
     btnCSV.textContent = '📄 CSVから発送実績';
     btnCSV.style.cssText = btnStyle+'background:#1abc9c;color:#fff;';
     btnCSV.onclick = ()=>openCSVPanel();
     footer.appendChild(btnSS);
     footer.appendChild(btnCW);
     footer.appendChild(btnNT);
     footer.appendChild(btnAll);
     footer.appendChild(btnShip);
     footer.appendChild(btnCSV);
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
