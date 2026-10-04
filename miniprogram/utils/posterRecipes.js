// 包内自带的卡片模板配方。
//
// 这一份是"服务端那份下发不到时的兜底"（方案 docs/方案-卡片模板不走发版.md §四），
// 所以这里只许有数据：不许 require 任何东西、不许出现函数、不许出现字符串形式的代码。
// 每一步都能和 poster.js 里同名 planner 一行行对着读——数字、顺序、什么时候切字体，
// 全按 planner 原样抄；逐层等价由 docs/工具/验-模板配方等价.js 那 480 组指纹证明，
// 不是靠"看着一样"。
//
// 为什么数字要写成 let 而不直接填进图层：planner 里这些数既参与算高度又参与落笔，
// 配方也得有同一个中间量，否则同一处几何要在两处各写一遍。

module.exports = {
  // 金句：整张是一枚大白卡，眉标一行、金句大字、标题小字，卡外底部是署名行 + 码贴纸。
  quote: {
    id: 'quote',
    min_version: 1,
    steps: [
      { let: 'cardX', value: 40 },
      { let: 'cardY', value: 60 },
      { let: 'pad', value: 52 },
      { let: 'qrSize', value: 128 },
      { let: 'tone', value: { prim: 'paperOf', args: { categoryId: { var: 'note.category_id' } } } },
      { let: 'cardW', value: { '-': [{ var: 'W' }, { '*': [{ var: 'cardX' }, 2] }] } },
      { let: 'innerW', value: { '-': [{ var: 'cardW' }, { '*': [{ var: 'pad' }, 2] }] } },

      // 先量字再算高度：顺序照 planner（眉标 clip → 金句 fit → 标题 clip），
      // 绘制序列指纹记的就是这个顺序。
      {
        let: 'kicker',
        value: {
          prim: 'clipLine',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } },
            maxW: { var: 'innerW' },
            size: 24,
            bold: true,
          },
        },
      },
      { let: 'qSize', value: 46 },
      { let: 'qLH', value: 68 },
      { let: 'quoteLines', value: { prim: 'fitLines', args: { text: { prim: 'quoteText' }, maxW: { var: 'innerW' }, n: 5, size: { var: 'qSize' }, bold: true } } },
      { let: 'tSize', value: 26 },
      // planner 里那一次 font(26) 在三元表达式外面（没标题也照切），所以这一步不能并进下面那个 if。
      { do: { prim: 'setFont', args: { size: { var: 'tSize' } } } },
      { let: 'titleLine', value: [] },
      {
        if: {
          cond: { truthy: { var: 'note.title' } },
          then: [{ let: 'titleLine', value: [{ prim: 'clipLine', args: { text: { var: 'note.title' }, maxW: { var: 'innerW' } } }] }],
        },
      },

      { let: 'kickerY', value: { '+': [{ var: 'cardY' }, { var: 'pad' }, 24] } },
      { let: 'quoteTop', value: { '+': [{ var: 'kickerY' }, 52] } },
      { let: 'quoteBottom', value: { '+': [{ var: 'quoteTop' }, { '*': [{ '-': [{ len: { var: 'quoteLines' } }, 1] }, { var: 'qLH' }] }, { var: 'qSize' }] } },
      { let: 'titleBottom', value: { if: [{ truthy: { var: 'titleLine' } }, { '+': [{ var: 'quoteBottom' }, 40, { var: 'tSize' }] }, { var: 'quoteBottom' }] } },
      { let: 'cardBottom', value: { '+': [{ var: 'titleBottom' }, { var: 'pad' }] } },
      { let: 'cardH', value: { '-': [{ var: 'cardBottom' }, { var: 'cardY' }] } },
      { let: 'signTop', value: { '+': [{ var: 'cardBottom' }, 56] } },
      {
        let: 'sign',
        value: {
          prim: 'signRow',
          args: {
            x: { '+': [{ var: 'cardX' }, { var: 'pad' }] },
            y: { var: 'signTop' },
            maxW: { '-': [{ var: 'innerW' }, { var: 'qrSize' }, 40] },
            size: 30,
            avatarD: 88,
            onDark: { var: 'tone.onDark' },
          },
        },
      },
      { let: 'qrX', value: { '-': [{ var: 'W' }, { var: 'cardX' }, { var: 'pad' }, { var: 'qrSize' }] } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ prim: 'qrStickerH', args: { size: { var: 'qrSize' } } }, { var: 'sign.h' }] }, 56] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 'tone.bg' } } },
      { emit: { k: 'rrect', x: { var: 'cardX' }, y: { var: 'cardY' }, w: { var: 'cardW' }, h: { var: 'cardH' }, r: 48, fill: { prim: 'token', args: { name: 'paper' } } } },
      // 眉标不能直接用分类色写字：芥末黄压白底只有 1.63 的对比度（palette.js 里那条），
      // 掺一半墨下去保住色相又能看清。
      {
        emit: {
          k: 'text',
          x: { '+': [{ var: 'cardX' }, { var: 'pad' }] },
          y: { var: 'kickerY' },
          lines: [{ var: 'kicker' }],
          size: 24,
          weight: 'bold',
          color: { prim: 'mix', args: { c1: { var: 'tone.bg' }, c2: { prim: 'token', args: { name: 'ink' } }, w: 0.55 } },
        },
      },
      {
        emit: {
          k: 'text',
          x: { '+': [{ var: 'cardX' }, { var: 'pad' }] },
          y: { '+': [{ var: 'quoteTop' }, { var: 'qSize' }] },
          lines: { var: 'quoteLines' },
          lh: { var: 'qLH' },
          size: { var: 'qSize' },
          weight: 'bold',
          color: { prim: 'token', args: { name: 'ink' } },
        },
      },
      {
        if: {
          cond: { truthy: { var: 'titleLine' } },
          then: [{
            emit: {
              k: 'text',
              x: { '+': [{ var: 'cardX' }, { var: 'pad' }] },
              y: { '+': [{ var: 'quoteBottom' }, 40, { var: 'tSize' }] },
              lines: { var: 'titleLine' },
              size: { var: 'tSize' },
              color: { prim: 'token', args: { name: 'muted' } },
            },
          }],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      // 底托用分类色调暗的那一档：这张的底色就是分类色，同色托等于没有。
      // 引导语直接坐在分类色上，所以用它自己配好的那个字色，不写死白。
      {
        let: 'qr',
        value: {
          prim: 'qrSticker',
          args: {
            x: { var: 'qrX' },
            y: { var: 'signTop' },
            size: { var: 'qrSize' },
            offset: { prim: 'mix', args: { c1: { var: 'tone.bg' }, c2: { prim: 'token', args: { name: 'ink' } }, w: 0.28 } },
            ink: { var: 'tone.ink' },
            label: { prim: 'i18n', args: { key: 'scanToView' } },
          },
        },
      },
      { emitMany: { var: 'qr.layers' } },
    ],
  },
}
