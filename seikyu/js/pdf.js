// PDF 生成（pdf-lib + fontkit + IPAゴシック）
(function () {
  'use strict';

  var W = 595.28, H = 841.89;     // A4 縦 (pt)
  var M = 42;                      // 左右の余白
  var CW = W - M * 2;              // 本文の幅
  var LIMIT = H - 52;              // 本文の下端（上からの y）
  var fontBytesPromise = null;

  var api = {
    fontUrl: 'fonts/ipag.ttf',
    generate: generate,
    download: download,
    filename: filename,
    estimateFields: estimateFields
  };

  // 帳票の種類ごとの文言
  var LABELS = {
    invoice: {
      prefix: '請求書', title: '請　求　書', cont: '請求書（続き）',
      date: '請求日', number: '請求書番号',
      lead: '下記のとおりご請求申し上げます。',
      amount: 'ご請求金額', due: 'お支払期限', billed: 'ご請求金額', bank: true
    },
    estimate: {
      prefix: '見積書', title: '見　積　書', cont: '見積書（続き）',
      date: '見積日', number: '見積番号',
      lead: '下記のとおりお見積り申し上げます。',
      amount: 'お見積金額', due: '有効期限', billed: 'お見積金額', bank: false
    }
  };

  function labelsFor(opts) {
    return opts && opts.docType === 'estimate' ? LABELS.estimate : LABELS.invoice;
  }

  // YYYY-MM-DD に日数を足す（UTC で計算するのでタイムゾーンの影響なし）
  function addDays(ymd, days) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str(ymd));
    if (!m) return '';
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  // 見積書の番号・日付（invoice.estimate が無ければ請求書から推定）
  function estimateFields(invoice) {
    invoice = invoice || {};
    var e = invoice.estimate || {};
    var issueDate = str(e.issueDate) || addDays(invoice.issueDate, -14);
    return {
      number: str(e.number) || (str(invoice.number) ? 'Q' + str(invoice.number) : ''),
      issueDate: issueDate,
      validUntil: str(e.validUntil) || addDays(issueDate, 30)
    };
  }

  // 描画用に番号・日付を差し替えた請求書
  function viewFor(invoice, opts) {
    invoice = invoice || {};
    if (labelsFor(opts) !== LABELS.estimate) return invoice;
    var f = estimateFields(invoice);
    return Object.assign({}, invoice, { number: f.number, issueDate: f.issueDate, dueDate: f.validUntil });
  }

  // ---- フォント ----

  function loadFontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = fetch(api.fontUrl).then(function (res) {
        if (!res.ok) throw new Error('フォントを読み込めませんでした: ' + api.fontUrl + ' (' + res.status + ')');
        return res.arrayBuffer();
      }).catch(function (err) {
        fontBytesPromise = null; // 次回やり直せるように
        throw err;
      });
    }
    return fontBytesPromise;
  }

  // ---- 小物 ----

  function palette() {
    var rgb = window.PDFLib.rgb;
    return {
      ink: rgb(0.11, 0.11, 0.11),
      grey: rgb(0.42, 0.42, 0.42),
      rule: rgb(0.72, 0.72, 0.72),
      faint: rgb(0.86, 0.86, 0.86),
      accent: rgb(0x2f / 255, 0x4f / 255, 0x4f / 255),
      tint: rgb(0.93, 0.95, 0.95),
      stripe: rgb(0.975, 0.98, 0.98),
      white: rgb(1, 1, 1)
    };
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  function fmtDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str(s));
    if (!m) return str(s);
    return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
  }

  function fmtNum(n) {
    n = Number(n);
    if (!isFinite(n)) return '';
    var neg = n < 0;
    n = Math.abs(n);
    var int = Math.floor(n);
    var frac = Math.round((n - int) * 100);
    if (frac === 100) { int += 1; frac = 0; }
    var s = int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (frac) s += '.' + (frac < 10 ? '0' + frac : String(frac)).replace(/0$/, '');
    return (neg ? '-' : '') + s;
  }

  function yen(n) {
    return window.Calc.yen(n);
  }

  // 行頭に来てはいけない文字（ぶら下げで前の行に付ける）
  var NO_START = '、。，．,.)）」』】〕〉》！？!?ー～ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・：；:;';

  // 行末に来てはいけない文字（次の行へ送る）
  var NO_END = '(（「『【〔〈《';

  // 幅に合わせて文字単位で折り返す。改行はそのまま段落の区切り
  function wrapText(text, font, size, maxW) {
    var out = [];
    str(text).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n').forEach(function (para) {
      var line = '', w = 0;
      Array.from(para).forEach(function (c) {
        var cw = font.widthOfTextAtSize(c, size);
        if (line && w + cw > maxW) {
          if (NO_START.indexOf(c) >= 0) {
            out.push(line + c);
            line = ''; w = 0;
            return;
          }
          var carry = '';
          var last = line.slice(-1);
          if (line.length > 1 && NO_END.indexOf(last) >= 0) {
            carry = last;
            line = line.slice(0, -1);
          }
          out.push(line);
          if (c === ' ' && !carry) { line = ''; w = 0; return; }
          line = carry; w = carry ? font.widthOfTextAtSize(carry, size) : 0;
        }
        line += c; w += cw;
      });
      out.push(line);
    });
    return out;
  }

  // 1行に収まるまで文字サイズを下げる
  function fitSize(text, font, size, maxW, min) {
    min = min || 7;
    while (size > min && font.widthOfTextAtSize(str(text), size) > maxW) size -= 0.5;
    return size;
  }

  // ---- 描画コンテキスト ----
  // y はすべて「ページ上端からの距離」で扱う

  function Ctx(doc, font, C, invoice, L) {
    this.L = L;
    this.doc = doc;
    this.font = font;
    this.C = C;
    this.invoice = invoice;
    this.page = null;
    this.y = 0;
  }

  Ctx.prototype.text = function (s, x, y, size, opt) {
    opt = opt || {};
    s = str(s);
    if (!s) return 0;
    var w = this.font.widthOfTextAtSize(s, size);
    var dx = x;
    if (opt.align === 'right') dx = x - w;
    else if (opt.align === 'center') dx = x - w / 2;
    var o = { x: dx, y: H - y - size * 0.88, size: size, font: this.font, color: opt.color || this.C.ink };
    this.page.drawText(s, o);
    if (opt.bold) {
      o.x = dx + size * 0.03;
      this.page.drawText(s, o);
    }
    return w;
  };

  Ctx.prototype.hline = function (x1, x2, y, t, color) {
    this.page.drawLine({
      start: { x: x1, y: H - y }, end: { x: x2, y: H - y },
      thickness: t || 0.5, color: color || this.C.rule
    });
  };

  Ctx.prototype.vline = function (x, y1, y2, t, color) {
    this.page.drawLine({
      start: { x: x, y: H - y1 }, end: { x: x, y: H - y2 },
      thickness: t || 0.5, color: color || this.C.rule
    });
  };

  Ctx.prototype.rect = function (x, y, w, h, opt) {
    opt = opt || {};
    var o = { x: x, y: H - y - h, width: w, height: h };
    if (opt.fill) o.color = opt.fill;
    if (opt.border) { o.borderColor = opt.border; o.borderWidth = opt.borderWidth || 0.5; }
    this.page.drawRectangle(o);
  };

  Ctx.prototype.newPage = function () {
    this.page = this.doc.addPage([W, H]);
    this.y = M;
  };

  // 2ページ目以降の簡略ヘッダ
  Ctx.prototype.contHeader = function () {
    var inv = this.invoice, cs = inv.clientSnapshot || {};
    this.newPage();
    this.text(this.L.cont, M, 40, 12, { color: this.C.accent, bold: true });
    var right = this.L.number + ' ' + str(inv.number);
    this.text(right, W - M, 42, 8.5, { align: 'right', color: this.C.grey });
    var to = str(cs.name) ? str(cs.name) + ' ' + str(cs.honorific || '御中') : '';
    if (to) {
      var size = fitSize(to, this.font, 8.5, CW - 140 - this.font.widthOfTextAtSize(right, 8.5));
      this.text(to, W - M - this.font.widthOfTextAtSize(right, 8.5) - 16, 42, size, { align: 'right', color: this.C.grey });
    }
    this.hline(M, W - M, 60, 0.8, this.C.accent);
    this.y = 76;
  };

  Ctx.prototype.ensure = function (h) {
    if (this.y + h > LIMIT) {
      this.contHeader();
      return true;
    }
    return false;
  };

  // ---- 各ブロック ----

  function drawFirstHeader(ctx, invoice, settings) {
    var C = ctx.C, font = ctx.font;
    var cs = invoice.clientSnapshot || {};
    var is = settings.issuer || {};

    // タイトル
    ctx.text(ctx.L.title, W / 2, 40, 22, { align: 'center', bold: true });
    ctx.hline(W / 2 - 78, W / 2 + 78, 72, 1.2, C.accent);
    ctx.hline(W / 2 - 78, W / 2 + 78, 74.6, 0.4, C.accent);

    // 右上: 請求日・番号
    var rx = W - M - 200;
    var ry = 96;
    [[ctx.L.date, fmtDate(invoice.issueDate)], [ctx.L.number, str(invoice.number)]].forEach(function (p) {
      ctx.text(p[0], rx, ry, 8.5, { color: C.grey });
      ctx.text(p[1], W - M, ry - 0.5, 9.5, { align: 'right' });
      ctx.hline(rx, W - M, ry + 14, 0.4, C.faint);
      ctx.y = ry;
      ry += 19;
    });

    // 右: 請求元
    var iy = ry + 12;
    var iw = 200;
    var sealTop = iy - 4;
    if (str(is.name)) {
      var ns = fitSize(is.name, font, 12, iw);
      ctx.text(is.name, rx, iy, ns, { bold: true });
      iy += ns + 8;
    }
    var addr = [];
    if (str(is.postal)) addr.push('〒' + str(is.postal).replace(/^〒/, ''));
    if (str(is.address)) addr.push(str(is.address));
    wrapText(addr.join('\n'), font, 8.5, iw).forEach(function (l) {
      if (!l) return;
      ctx.text(l, rx, iy, 8.5);
      iy += 12.5;
    });
    if (str(is.tel)) { ctx.text('TEL ' + is.tel, rx, iy, 8.5); iy += 12.5; }
    if (str(is.email)) {
      wrapText(is.email, font, 8.5, iw).forEach(function (l) { ctx.text(l, rx, iy, 8.5); iy += 12.5; });
    }
    if (str(is.registrationNumber)) {
      iy += 2;
      ctx.text('登録番号 ' + is.registrationNumber, rx, iy, 8.5, { color: C.grey });
      iy += 12.5;
    }
    var rightEnd = iy;

    // 角印（右寄せで屋号に重ねる）
    if (str(is.sealDataUrl)) {
      return embedSeal(ctx.doc, is.sealDataUrl).then(function (img) {
        if (img) {
          var s = Math.min(62 / img.width, 62 / img.height);
          var w = img.width * s, h = img.height * s;
          ctx.page.drawImage(img, { x: W - M - w + 4, y: H - sealTop - h, width: w, height: h, opacity: 0.92 });
          rightEnd = Math.max(rightEnd, sealTop + h);
        }
        return drawLeftColumn(ctx, invoice, settings, rightEnd);
      });
    }
    return Promise.resolve(drawLeftColumn(ctx, invoice, settings, rightEnd));
  }

  function embedSeal(doc, dataUrl) {
    var isJpg = /^data:image\/jpe?g/i.test(dataUrl);
    var first = isJpg ? doc.embedJpg(dataUrl) : doc.embedPng(dataUrl);
    return first.catch(function () {
      return (isJpg ? doc.embedPng(dataUrl) : doc.embedJpg(dataUrl));
    }).catch(function () {
      return null; // 読めない画像は無視
    });
  }

  function drawLeftColumn(ctx, invoice, settings, rightEnd) {
    var C = ctx.C, font = ctx.font;
    var cs = invoice.clientSnapshot || {};
    var lw = 285;
    var y = 100;

    // 宛先名 + 敬称（下線）
    var hon = str(cs.honorific || '御中');
    var hw = font.widthOfTextAtSize(hon, 11);
    var nameSize = fitSize(cs.name, font, 15, lw - hw - 10, 9);
    var nameLines = font.widthOfTextAtSize(str(cs.name), nameSize) > lw - hw - 10
      ? wrapText(cs.name, font, nameSize, lw - hw - 10) : [str(cs.name)];
    nameLines.forEach(function (l, i) {
      var w = ctx.text(l, M + 2, y, nameSize);
      if (i === nameLines.length - 1) ctx.text(hon, M + 2 + w + 8, y + nameSize - 11, 11);
      if (i < nameLines.length - 1) y += nameSize + 5;
    });
    y += nameSize + 6;
    ctx.hline(M, M + lw, y, 0.9, C.ink);
    y += 8;

    var addr = [];
    if (str(cs.postal)) addr.push('〒' + str(cs.postal).replace(/^〒/, ''));
    if (str(cs.address)) addr.push(str(cs.address));
    wrapText(addr.join('\n'), font, 8.5, lw).forEach(function (l) {
      if (!l) return;
      ctx.text(l, M + 2, y, 8.5, { color: C.grey });
      y += 12.5;
    });
    if (str(cs.contactName)) {
      var cn = str(cs.contactName);
      if (!/様$/.test(cn)) cn += ' 様';
      ctx.text('ご担当: ' + cn, M + 2, y, 8.5, { color: C.grey });
      y += 12.5;
    }

    y += 14;
    ctx.text(ctx.L.lead, M, y, 9.5);
    y += 22;

    // 件名
    if (str(invoice.title)) {
      var tl = wrapText(invoice.title, font, 10, lw - 42);
      ctx.text('件名', M + 2, y + 1, 8.5, { color: C.grey });
      tl.forEach(function (l) { ctx.text(l, M + 40, y, 10); y += 14; });
      y += 1;
      ctx.hline(M, M + lw, y, 0.5, C.rule);
      y += 12;
    }

    // ご請求金額
    var sum = window.Calc.summarize(invoice, settings.rounding);
    var bh = 42, lab = 92;
    ctx.rect(M, y, lab, bh, { fill: C.accent });
    ctx.rect(M + lab, y, lw - lab, bh, { border: C.accent, borderWidth: 1 });
    ctx.text(ctx.L.amount, M + lab / 2, y + 11, 10.5, { align: 'center', color: C.white, bold: true });
    ctx.text('（税込）', M + lab / 2, y + 26, 7.5, { align: 'center', color: C.white });
    var amt = yen(sum.billed) + ' -';
    var as = fitSize(amt, font, 20, lw - lab - 20, 12);
    ctx.text(amt, M + lw - 12, y + (bh - as) / 2, as, { align: 'right', bold: true });
    y += bh + 6;

    // お支払期限
    if (str(invoice.dueDate)) {
      var dh = 22;
      ctx.rect(M, y, lab, dh, { fill: C.tint });
      ctx.rect(M, y, lw, dh, { border: C.rule, borderWidth: 0.5 });
      ctx.text(ctx.L.due, M + lab / 2, y + 6.5, 9, { align: 'center', color: C.accent });
      ctx.text(fmtDate(invoice.dueDate), M + lw - 12, y + 6, 10, { align: 'right' });
      y += dh;
    }

    ctx.y = Math.max(y, rightEnd) + 22;
    return sum;
  }

  // 明細表
  var COLS = [
    { key: 'name', label: '品目', w: 0 },
    { key: 'qty', label: '数量', w: 52 },
    { key: 'unit', label: '単位', w: 40 },
    { key: 'price', label: '単価', w: 84 },
    { key: 'amount', label: '金額', w: 92 }
  ];

  function colX() {
    var fixed = 0;
    COLS.forEach(function (c) { if (c.w) fixed += c.w; });
    var xs = [], x = M;
    COLS.forEach(function (c) {
      var w = c.w || CW - fixed;
      xs.push({ x: x, w: w, key: c.key, label: c.label });
      x += w;
    });
    return xs;
  }

  function drawTableHeader(ctx, cols) {
    var C = ctx.C, y = ctx.y, h = 20;
    ctx.rect(M, y, CW, h, { fill: C.accent });
    cols.forEach(function (c) {
      ctx.text(c.label, c.x + c.w / 2, y + 5.5, 9, { align: 'center', color: C.white });
    });
    ctx.y += h;
  }

  function drawItems(ctx, invoice) {
    var C = ctx.C, font = ctx.font;
    var cols = colX();
    var items = (invoice.items || []).filter(function (it) {
      return it && (str(it.name) || Number(it.quantity) || Number(it.unitPrice));
    });
    var hasReduced = false;
    var size = 9, lh = 12.5;

    ctx.ensure(20 + 22 * 2);
    drawTableHeader(ctx, cols);

    var rows = items.map(function (it) {
      var reduced = Number(it.taxRate) === 8;
      if (reduced) hasReduced = true;
      var name = str(it.name) + (reduced ? ' ※' : '');
      return {
        lines: wrapText(name, font, size, cols[0].w - 12),
        qty: fmtNum(it.quantity),
        unit: str(it.unit),
        price: fmtNum(it.unitPrice),
        amount: fmtNum(window.Calc.lineAmount(it))
      };
    });
    // 行が少ないときは空行で埋めて体裁を整える
    while (rows.length < 5) rows.push({ lines: [''], blank: true });

    rows.forEach(function (r, i) {
      var h = Math.max(22, r.lines.length * lh + 9);
      if (ctx.y + h > LIMIT) {
        ctx.hline(M, W - M, ctx.y, 0.8, C.accent);
        ctx.contHeader();
        drawTableHeader(ctx, cols);
      }
      var y = ctx.y;
      if (i % 2 === 1) ctx.rect(M, y + 0.3, CW, h - 0.6, { fill: C.stripe });
      var ty = y + (h - r.lines.length * lh) / 2 + 1.5;
      r.lines.forEach(function (l, j) { ctx.text(l, cols[0].x + 6, ty + j * lh, size); });
      if (!r.blank) {
        var my = y + (h - size) / 2;
        ctx.text(r.qty, cols[1].x + cols[1].w - 6, my, size, { align: 'right' });
        var us = fitSize(r.unit, font, size, cols[2].w - 6, 6);
        ctx.text(r.unit, cols[2].x + cols[2].w / 2, y + (h - us) / 2, us, { align: 'center' });
        ctx.text(r.price, cols[3].x + cols[3].w - 6, my, size, { align: 'right' });
        ctx.text(r.amount, cols[4].x + cols[4].w - 6, my, size, { align: 'right' });
      }
      // 罫線
      ctx.hline(M, W - M, y + h, 0.4, C.rule);
      cols.forEach(function (c, k) {
        if (k > 0) ctx.vline(c.x, y, y + h, 0.4, C.faint);
      });
      ctx.vline(M, y, y + h, 0.5, C.rule);
      ctx.vline(W - M, y, y + h, 0.5, C.rule);
      ctx.y = y + h;
    });
    ctx.hline(M, W - M, ctx.y, 0.8, C.accent);
    ctx.y += 6;
    if (hasReduced) {
      ctx.text('※は軽減税率（8%）対象', M + 2, ctx.y, 8, { color: C.grey });
    }
    ctx.y += 16;
  }

  function rateLabel(rate) {
    if (rate === 8) return '8%対象（軽減）';
    if (rate === 0) return '0%対象';
    return rate + '%対象';
  }

  // 小計・税率ごと内訳・合計
  function drawTotals(ctx, invoice, sum) {
    var C = ctx.C;
    var rh = 20;

    var right = [['小計（税抜）', yen(sum.subtotal)], ['消費税', yen(sum.taxTotal)], ['合計（税込）', yen(sum.total)]];
    if (invoice.withholding) right.push(['源泉徴収税額', '▲' + yen(sum.withholding)]);
    right.push([ctx.L.billed, yen(sum.billed)]);
    var leftH = rh * (sum.byRate.length + 1);
    var rightH = rh * right.length;
    ctx.ensure(Math.max(leftH, rightH) + 10);

    var y0 = ctx.y;

    // 左: 税率ごとの内訳（インボイス制度の記載事項）
    var lx = M, lw = 248;
    var c1 = 92, c2 = 82;
    ctx.rect(lx, y0, lw, rh, { fill: C.tint });
    ctx.text('税率区分', lx + 8, y0 + 6, 8, { color: C.accent });
    ctx.text('対象額（税抜）', lx + c1 + c2 - 6, y0 + 6, 8, { align: 'right', color: C.accent });
    ctx.text('消費税額', lx + lw - 8, y0 + 6, 8, { align: 'right', color: C.accent });
    var y = y0 + rh;
    sum.byRate.forEach(function (r) {
      ctx.text(rateLabel(r.rate), lx + 8, y + 6, 8.5);
      ctx.text(yen(r.base), lx + c1 + c2 - 6, y + 6, 8.5, { align: 'right' });
      ctx.text(r.rate === 0 ? '—' : yen(r.tax), lx + lw - 8, y + 6, 8.5, { align: 'right' });
      ctx.hline(lx, lx + lw, y + rh, 0.4, C.faint);
      y += rh;
    });
    ctx.hline(lx, lx + lw, y0, 0.5, C.rule);
    ctx.hline(lx, lx + lw, y, 0.5, C.rule);

    // 右: 合計欄
    var rw = 232, rx = W - M - rw;
    y = y0;
    right.forEach(function (p, i) {
      var last = i === right.length - 1;
      if (last) {
        ctx.rect(rx, y, rw, rh + 4, { fill: C.tint });
        ctx.hline(rx, rx + rw, y, 0.9, C.accent);
        ctx.text(p[0], rx + 8, y + 6, 9.5, { color: C.accent, bold: true });
        ctx.text(p[1], rx + rw - 8, y + 5, 11, { align: 'right', bold: true });
        ctx.hline(rx, rx + rw, y + rh + 4, 0.9, C.accent);
        y += rh + 4;
      } else {
        var isTotal = p[0] === '合計（税込）';
        ctx.text(p[0], rx + 8, y + 6, 8.5, { color: isTotal ? C.ink : C.grey });
        ctx.text(p[1], rx + rw - 8, y + 6, 9, { align: 'right' });
        if (i === 0) ctx.hline(rx, rx + rw, y, 0.5, C.rule);
        ctx.hline(rx, rx + rw, y + rh, 0.4, C.faint);
        y += rh;
      }
    });

    ctx.y = Math.max(y0 + leftH, y) + 22;
  }

  // ラベル付きの枠（お振込先・備考）。長いときはページをまたぐ
  function drawBlock(ctx, label, text) {
    var C = ctx.C, font = ctx.font;
    if (!str(text).trim()) return;
    var size = 9, lh = 13.5, pad = 8;
    var lines = wrapText(str(text).replace(/\s+$/, ''), font, size, CW - pad * 2);
    var i = 0, first = true;
    while (i < lines.length) {
      ctx.ensure(18 + pad * 2 + lh * Math.min(2, lines.length - i));
      ctx.rect(M, ctx.y + 1, 3, 11, { fill: C.accent });
      ctx.text(first ? label : label + '（続き）', M + 8, ctx.y + 1, 9.5, { color: C.accent, bold: true });
      ctx.y += 18;
      var n = Math.max(1, Math.min(lines.length - i, Math.floor((LIMIT - ctx.y - pad * 2) / lh)));
      var bh = n * lh + pad * 2 - 3;
      ctx.rect(M, ctx.y, CW, bh, { border: C.rule, borderWidth: 0.5 });
      for (var k = 0; k < n; k++) {
        ctx.text(lines[i + k], M + pad, ctx.y + pad + k * lh, size);
      }
      i += n;
      ctx.y += bh + 16;
      first = false;
    }
  }

  function drawPageNumbers(ctx) {
    var pages = ctx.doc.getPages();
    if (pages.length < 2) return;
    pages.forEach(function (p, i) {
      ctx.page = p;
      ctx.text((i + 1) + ' / ' + pages.length, W / 2, H - 32, 8, { align: 'center', color: ctx.C.grey });
    });
  }

  // ---- 公開 API ----

  function generate(invoice, settings, opts) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) return Promise.reject(new Error('pdf-lib が読み込まれていません'));
    if (!window.fontkit) return Promise.reject(new Error('fontkit が読み込まれていません'));
    var L = labelsFor(opts);
    invoice = viewFor(invoice, opts);
    settings = settings || {};
    var doc, ctx;

    return Promise.all([PDFLib.PDFDocument.create(), loadFontBytes()]).then(function (r) {
      doc = r[0];
      doc.registerFontkit(window.fontkit);
      return doc.embedFont(r[1], { subset: true });
    }).then(function (font) {
      var cs = invoice.clientSnapshot || {};
      var is = settings.issuer || {};
      doc.setTitle(L.prefix + ' ' + str(invoice.number));
      if (str(is.name)) doc.setAuthor(str(is.name));
      doc.setSubject(str(cs.name) + ' ' + str(invoice.title));
      doc.setCreator('seikyu');
      doc.setProducer('seikyu (pdf-lib)');

      ctx = new Ctx(doc, font, palette(), invoice, L);
      ctx.newPage();
      return drawFirstHeader(ctx, invoice, settings);
    }).then(function (sum) {
      drawItems(ctx, invoice);
      drawTotals(ctx, invoice, sum);
      if (L.bank) drawBlock(ctx, 'お振込先', (settings.issuer || {}).bank);
      drawBlock(ctx, '備考', invoice.notes);
      drawPageNumbers(ctx);
      return doc.save();
    });
  }

  // ファイル名に使えない文字を除く
  function sanitize(s) {
    return str(s)
      .replace(/[\\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.]+|[_.]+$/g, '')
      .slice(0, 60);
  }

  function filename(invoice, opts) {
    var L = labelsFor(opts);
    invoice = viewFor(invoice, opts);
    var cs = invoice.clientSnapshot || {};
    var parts = [L.prefix, sanitize(invoice.number) || 'draft'];
    var c = sanitize(cs.name);
    if (c) parts.push(c);
    return parts.join('_') + '.pdf';
  }

  function download(invoice, settings, opts) {
    return generate(invoice, settings, opts).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename(invoice, opts);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      return bytes;
    });
  }

  window.InvoicePDF = api;
})();
