// parsers.js — shared parsing/categorisation logic.
// Loaded by index.html as a plain <script> (defines globals for the browser)
// AND required directly by tests/parser.test.js via Node (module.exports).
// This is the literal code that runs in both places — keep it that way.

const MONTH_NUM={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

const CAT_COLORS={
  grocery:'#1A6B4A',food:'#2D7A4F',transport:'#1B5FA5',shopping:'#A0560A',
  utilities:'#4A3FAB',entertainment:'#8B2252',health:'#3A6B0F',travel:'#8B3015',
  remittance:'#7A4A0A',transfer:'#5F5E5A',investment:'#1557B0',
  income:'#1E5C0F',salary:'#1E5C0F',interest:'#0C447C',other:'#6B6A65'
};
const CAT_BG={
  grocery:'#C8EEE0',food:'#D8F2E6',transport:'#D6E8F8',shopping:'#FAE8D2',
  utilities:'#E8E6FA',entertainment:'#F8DDE9',health:'#DEF0CC',travel:'#F8E4DC',
  remittance:'#F6ECDA',transfer:'#ECEAE4',investment:'#D6E8F8',
  income:'#B8E8A0',salary:'#B8E8A0',interest:'#C0E8F8',other:'#ECEAE4'
};

// ── Categorisation ────────────────────────────────────────────────────────────
const RULES={
  grocery:['fairprice','cold storage','giant','sheng siong','ntuc','cheers','market place','supermarket','redmart','jasons','little farms','don don donki','donki','prime supermarket'],
  food:['grabfood','foodpanda','mcdonalds','kopitiam','restaurant','cafe','coffee','hawker','toast','udon','peperoni','ya kun','four leaves','haruyama','snackz','kaya','burger','pizza','sushi','ramen','prata','subway','kfc','bakery','dessert','bubble tea','wonton','noodle','eatery','bistro','grill','kitchen','mala','grainsandco','churn','common man','cmcr'],
  transport:['bus/mrt','bus / mrt','gojek','grab transport','taxi','ez-link','parking','petrol','helloride','comfortdelgro','smrt','transitlink','grab','grabcar'],
  shopping:['shopee','lazada','amazon','zara','uniqlo','mustafa','off season','shopback','2c2p','taobao','qoo10','cotton on','courts','harvey norman','ikea','sunday staples','krispay'],
  utilities:['singtel','starhub','m1 ','sp group','electricity','internet','broadband','mobile plan','simba'],
  entertainment:['netflix','spotify','cinema','shaw','cathay','gv ','golden village','disney','youtube','steam','ultra 808','karaoke'],
  health:['guardian','watsons','clinic','hospital','pharmacy','dental','polyclinic','raffles medical','parkway','mount elizabeth'],
  travel:['airasia','scoot','singapore airlines',' sia ','agoda','booking.com','hotel','airbnb','klook','expedia'],
  remittance:['nium pte'],
  investment:['uob kay hian','endowus','syfe','stashaway','moomoo','tiger broker'],
};

function categorise(desc,type){
  if(type==='income') return 'income';
  if(type==='investment') return 'investment';
  if(type==='transfer') return 'transfer';
  const d=desc.toLowerCase();
  for(const [cat,kws] of Object.entries(RULES)){if(kws.some(k=>d.includes(k))) return cat;}
  return 'other';
}

// ── DBS type detection ────────────────────────────────────────────────────────
function detectDBSType(desc,isWithdrawal){
  const d=desc.toLowerCase();
  // Dividends (e.g. "DIV:IA-UOB KAY HIAN") are always income — check before
  // anything else so the "uob kay hian → investment" withdrawal rule can't
  // misclassify a dividend deposit as an investment outflow.
  if(d.includes('div:')||d.includes('dividend')) return 'income';
  if(!isWithdrawal){
    if(d.includes('giro salary')) return 'income';
    if(d.includes('interest')||d.includes('int pymt')) return 'income';
    if(d.includes('digiportfolio')) return 'income';
    return null;
  }
  if(d.includes('nium pte')) return 'expense';
  if(d.includes('paylah')||d.includes('top-up to paylah')) return 'transfer';
  if(d.includes('uob kay hian')||d.includes('endowus')||d.includes('digiportfolio purchase')) return 'investment';
  if(d.includes('supplementary retirement')||d.includes('buy fund mgt')||d.trim()==='contribution'||d.includes('srs contribution')) return 'investment';
  if((d.includes('giro standing')||d.includes('giro '))&&(d.includes('multiplier')||d.includes('autosave'))) return null;
  if(d.includes('ccc -')||d.includes('i-bank')) return null;
  if(d.includes('paynow')||d.includes('fast payment')||d.includes('fast transfer')) return 'transfer';
  return 'expense';
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function dbsMonthYear(dateStr){
  const p=dateStr.split('/');
  return `${p[2]}-${p[1]}`;
}

function hsbcDetectYear(text){
  const m=text.match(/[Ff]rom\s+\d{1,2}\s+[A-Z]+\s+(\d{4})\s+to\s+\d{1,2}\s+([A-Z]+)\s+(\d{4})/i);
  if(m) return {startYear:parseInt(m[1]),endYear:parseInt(m[3]),endMonth:MONTH_NUM[m[2].toLowerCase().slice(0,3)]||12};
  const y=text.match(/20\d{2}/);
  const yr=y?parseInt(y[0]):new Date().getFullYear();
  return {startYear:yr,endYear:yr,endMonth:12};
}

function hsbcMonthYear(dateStr,endYear,endMonth){
  const parts=dateStr.trim().split(/\s+/);
  const mon=MONTH_NUM[parts[1].toLowerCase().slice(0,3)]||1;
  const year=(endMonth<=3&&mon>=10)?endYear-1:endYear;
  return `${year}-${String(mon).padStart(2,'0')}`;
}

// ── HSBC Parser ───────────────────────────────────────────────────────────────
function parseHSBC(text,source){
  const rows=[];
  const {endYear,endMonth}=hsbcDetectYear(text);
  // Capture TRAN DATE (2nd date) — that's when the money was actually spent,
  // which is what should drive month grouping, not POST DATE (1st date).
  const re=/\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(.+?)\s+([\d,]+\.\d{2})(CR)?(?:\s|$)/gi;
  let m;
  const repaymentTerms=['dbs','ocbc','uob','citibank','hsbc','standard chartered','payment received','autopay','direct debit','visa direct'];
  while((m=re.exec(text))!==null){
    const[,date,desc,amtStr,cr]=m;
    const skip=['previous statement','total due','continued','balance brought','minimum payment'];
    if(skip.some(s=>desc.toLowerCase().includes(s))) continue;
    const amount=parseFloat(amtStr.replace(/,/g,''));
    if(amount<0.1) continue;
    const month_year=hsbcMonthYear(date,endYear,endMonth);
    if(cr){
      // Repayments (bank transfers paying off the card) are excluded.
      // Cashback and merchant refunds are kept as inflows.
      if(repaymentTerms.some(t=>desc.toLowerCase().includes(t))) continue;
      rows.push({date,description:desc.trim(),amount,type:'income',flow:'inflow',category:'income',source,month_year});
    } else {
      rows.push({date,description:desc.trim(),amount,type:'expense',flow:'outflow',category:categorise(desc,'expense'),source,month_year});
    }
  }
  return rows;
}

// ── DBS Parser ────────────────────────────────────────────────────────────────
function parseDBS(text,source){
  const rows=[];
  const skipPeople=[];
  let full=text
    .replace(/VALUE DATE\s*:\s*\d{2}\/\d{2}\/\d{4}/gi,'')
    .replace(/\n/g,' ')
    .replace(/\s+/g,' ');
  // Strip balance summary lines (with their numbers) BEFORE segmenting on dates.
  // Without this, a page-boundary trailer like "...Balance Carried Forward SGD
  // 54,293.33 Balance Brought Forward SGD 54,293.33" glues onto whichever real
  // transaction precedes it (since nothing else separates them) and its extra
  // numbers get mistaken for the transaction amount. Order matters: the "Total
  // Balance Carried Forward..." variant must be stripped first since it contains
  // "Balance Carried Forward" as a substring.
  full=full
    .replace(/Total Balance Carried Forward(?:\s+in\s+SGD)?:\s*(?:[\d,]+\.\d{2}\s*){1,3}/gi,' ')
    .replace(/Balance Carried Forward\s*(?:SGD)?\s*[\d,]+\.\d{2}/gi,' ')
    .replace(/Balance Brought Forward\s*(?:SGD)?\s*[\d,]+\.\d{2}/gi,' ')
    .replace(/\s+/g,' ');
  const segments=full.split(/(?=\d{2}\/\d{2}\/\d{4})/);
  for(const seg of segments){
    const dm=seg.match(/^(\d{2}\/\d{2}\/\d{4})\s+/);
    if(!dm) continue;
    const date=dm[1];
    const rest=seg.slice(dm[0].length).trim();
    const nums=[...rest.matchAll(/([\d,]+\.\d{2})/g)];
    if(nums.length<2) continue;
    const amount=parseFloat(nums[nums.length-2][1].replace(/,/g,''));
    if(amount<0.01||amount>200000) continue;
    const amtPos=nums[nums.length-2].index;
    let desc=rest.slice(0,amtPos).replace(/^Advice\s+/i,'').replace(/\s+/g,' ').trim();
    if(!desc||desc.length<3) continue;
    const skip=['balance brought','balance carried','total balance','opening balance','closing balance'];
    if(skip.some(s=>desc.toLowerCase().includes(s))) continue;
    const descL=desc.toLowerCase();
    const isDeposit=['incoming','giro salary','interest','int pymt','digiportfolio','div:','dividend','from:','from '].some(k=>descL.includes(k));
    const type=detectDBSType(desc,!isDeposit);
    if(type===null) continue;
    if(isDeposit&&skipPeople.some(n=>descL.includes(n))) continue;
    const flow=isDeposit?'inflow':'outflow';
    const month_year=dbsMonthYear(date);
    rows.push({date,description:desc,amount,type,flow,category:categorise(desc,type),source,month_year});
  }
  return rows;
}

// ── Citibank Parser ───────────────────────────────────────────────────────────
function citiDetectYear(text){
  const m=text.match(/Statement\s+Date\s+(\w+)\s+\d{1,2},?\s+(\d{4})/i);
  if(m) return{stmtYear:parseInt(m[2]),stmtMonth:MONTH_NUM[m[1].toLowerCase().slice(0,3)]||12};
  const y=text.match(/20\d{2}/);
  return{stmtYear:y?parseInt(y[0]):new Date().getFullYear(),stmtMonth:12};
}

function citiMonthYear(dateStr,stmtYear,stmtMonth){
  const mon=MONTH_NUM[dateStr.trim().split(/\s+/)[1].toLowerCase().slice(0,3)]||1;
  const year=mon>stmtMonth?stmtYear-1:stmtYear;
  return`${year}-${String(mon).padStart(2,'0')}`;
}

function parseCiti(text,source){
  const rows=[];
  const{stmtYear,stmtMonth}=citiDetectYear(text);
  let full=text.replace(/\n/g,' ').replace(/\s+/g,' ');
  // Strip masked card number lines and balance/total lines before regex matching.
  full=full
    .replace(/XXXX-XXXX-XXXX-\d{4}/g,' ')
    .replace(/BALANCE PREVIOUS STATEMENT\s+[-\d,.()]+/gi,' ')
    .replace(/SUB-TOTAL:\s+[\d,.()]+/gi,' ')
    .replace(/GRAND TOTAL\s+[\d,.]+/gi,' ')
    .replace(/\s+/g,' ');
  const re=/(\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)) (.+?) ([\d,]+\.\d{2})(?=\s|$)/gi;
  let m;
  while((m=re.exec(full))!==null){
    const[,date,rawDesc,amtStr]=m;
    const amount=parseFloat(amtStr.replace(/,/g,''));
    if(amount<0.01) continue;
    // Strip trailing location noise: "SINGAPORE SG" or bare "SG"
    let desc=rawDesc
      .replace(/\s+singapore\s+sg\s*$/i,'')
      .replace(/\s+sg\s*$/i,'')
      .trim();
    if(!desc||desc.length<2) continue;
    const skip=['date description','transactions for','all transactions','previous statement','sub-total','grand total','balance'];
    if(skip.some(s=>desc.toLowerCase().includes(s))) continue;
    const month_year=citiMonthYear(date,stmtYear,stmtMonth);
    rows.push({date,description:desc,amount,type:'expense',flow:'outflow',category:categorise(desc,'expense'),source,month_year});
  }
  return rows;
}

// ── Trust Bank Parser ─────────────────────────────────────────────────────────
function parseTrust(text,source){
  const rows=[];
  const cycleM=text.match(/Statement cycle\s+\d{1,2} \w+ (\d{4})\s*[-–]\s*\d{1,2} (\w+) (\d{4})/i);
  const stmtYear=cycleM?parseInt(cycleM[3]):new Date().getFullYear();
  const stmtEndMonth=cycleM?(MONTH_NUM[cycleM[2].toLowerCase().slice(0,3)]||12):12;
  const full=text.replace(/\n/g,' ').replace(/\s+/g,' ');
  const MONS='Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
  const dateRe=new RegExp(`(\\d{1,2} (?:${MONS}))\\s*(\\d{1,2} (?:${MONS}))\\s*`,'gi');
  const matches=[];
  let dm;
  while((dm=dateRe.exec(full))!==null)
    matches.push({txDate:dm[1],start:dm.index,endIndex:dm.index+dm[0].length});
  for(let i=0;i<matches.length;i++){
    const content=full.slice(matches[i].endIndex,i+1<matches.length?matches[i+1].start:full.length).trim();
    const allAmts=[...content.matchAll(/([+]?[\d,]+\.\d{2})/g)];
    if(!allAmts.length) continue;
    const lastAmtMatch=allAmts[allAmts.length-1];
    const lastAmt=lastAmtMatch[1];
    const isCredit=lastAmt.startsWith('+');
    const amount=parseFloat(lastAmt.replace(/[+,]/g,''));
    if(amount<0.01) continue;
    let desc=content.slice(0,lastAmtMatch.index).trim();
    // Strip FCY noise: "TH1 THB = 0.0394 SGD ... THB"
    desc=desc.replace(/\s+[A-Z]{2,3}\d?\s+[A-Z]{3}\s*=.*$/i,'').trim();
    if(!desc||desc.length<2) continue;
    const skipAlways=['previous balance','total outstanding','transaction date','posting date','amount in','transaction details'];
    if(skipAlways.some(s=>desc.toLowerCase().includes(s))) continue;
    const txDate=matches[i].txDate;
    const mon=MONTH_NUM[txDate.trim().split(/\s+/)[1].toLowerCase().slice(0,3)]||1;
    const year=mon>stmtEndMonth?stmtYear-1:stmtYear;
    const month_year=`${year}-${String(mon).padStart(2,'0')}`;
    if(isCredit){
      // Repayments (bank transfers paying off the card) are not income — skip them.
      // Cashback, refunds, and other credits are real inflows.
      const repaymentTerms=['dbs','ocbc','uob','citibank','hsbc','standard chartered','payment received','repayment'];
      if(repaymentTerms.some(t=>desc.toLowerCase().includes(t))) continue;
      rows.push({date:txDate,description:desc,amount,type:'income',flow:'inflow',category:'income',source,month_year});
    } else {
      rows.push({date:txDate,description:desc,amount,type:'expense',flow:'outflow',category:categorise(desc,'expense'),source,month_year});
    }
  }
  return rows;
}

// ── Flow badge HTML ───────────────────────────────────────────────────────────
function flowBadge(flow,type){
  if(flow==='inflow') return `<span class="flow-in">↑ inflow</span>`;
  if(type==='investment') return `<span class="flow-out-inv">↓ invest</span>`;
  if(type==='transfer') return `<span class="flow-neutral">↔ transfer</span>`;
  return `<span class="flow-out">↓ outflow</span>`;
}

// Export for Node (tests); in the browser this block is skipped because
// `module` is undefined, and all functions above remain as globals.
if(typeof module!=='undefined'&&module.exports){
  module.exports={
    MONTH_NUM,CAT_COLORS,CAT_BG,RULES,
    categorise,detectDBSType,dbsMonthYear,hsbcDetectYear,hsbcMonthYear,citiDetectYear,citiMonthYear,
    parseHSBC,parseDBS,parseCiti,parseTrust,flowBadge
  };
}
