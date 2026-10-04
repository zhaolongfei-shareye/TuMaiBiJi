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

  // 玉版宣：白卡浮在宣纸渐变上，色带顶边沿卡片圆角切、底边是方的，左上色块里写分类名。
  card: {
    id: 'card',
    min_version: 1,
    steps: [
      { let: 'cardX', value: 40 },
      { let: 'cardY', value: 60 },
      { let: 'pad', value: 44 },
      { let: 'radius', value: 44 },
      { let: 'block', value: 148 },
      { let: 'titleSize', value: 34 },
      { let: 'titleLH', value: 46 },
      { let: 'metaSize', value: 22 },
      { let: 'bodySize', value: 27 },
      { let: 'bodyLH', value: 40 },
      { let: 'pointSize', value: 26 },
      { let: 'pointLH', value: 42 },
      { let: 'qrSize', value: 120 },
      { let: 'tone', value: { prim: 'paperOf', args: { categoryId: { var: 'note.category_id' } } } },
      { let: 'cardW', value: { '-': [{ var: 'W' }, { '*': [{ var: 'cardX' }, 2] }] } },
      { let: 'contentX', value: { '+': [{ var: 'cardX' }, { var: 'pad' }] } },
      { let: 'contentW', value: { '-': [{ var: 'cardW' }, { '*': [{ var: 'pad' }, 2] }] } },
      { let: 'titleX', value: { '+': [{ var: 'contentX' }, { var: 'block' }, 24] } },
      { let: 'titleW', value: { '-': [{ var: 'contentW' }, { var: 'block' }, 24] } },

      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { var: 'titleW' }, n: 3, size: { var: 'titleSize' }, bold: true } } },
      { let: 'bandH', value: { '+': [{ '*': [{ var: 'pad' }, 2] }, { max: [{ var: 'block' }, { '*': [{ len: { var: 'titleLines' } }, { var: 'titleLH' }] }] }] } },
      {
        let: 'metaLine',
        value: {
          prim: 'clipLine',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'sourceLabel' }, { prim: 'tagsJoined', args: { sep: ' / ' } }] } },
            maxW: { var: 'contentW' },
            size: { var: 'metaSize' },
            bold: true,
          },
        },
      },
      // 摘要没有就不量：那一次 font(27) 在三元外面，量字在里，所以拆成 do + if 两步。
      { do: { prim: 'setFont', args: { size: { var: 'bodySize' } } } },
      { let: 'summaryLines', value: [] },
      {
        if: {
          cond: { truthy: { var: 'note.summary' } },
          then: [{ let: 'summaryLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { var: 'contentW' }, n: 4 } } }],
        },
      },
      { let: 'points', value: { prim: 'points', args: { limit: 5, maxW: { '-': [{ var: 'contentW' }, 50] }, size: { var: 'pointSize' } } } },

      { let: 'metaY', value: { '+': [{ var: 'cardY' }, { var: 'bandH' }, 56] } },
      { let: 'bottom', value: { '+': [{ var: 'metaY' }, 8] } },
      { let: 'summaryTop', value: 0 },
      {
        if: {
          cond: { truthy: { var: 'summaryLines' } },
          then: [
            { let: 'summaryTop', value: { '+': [{ var: 'bottom' }, 40] } },
            { let: 'bottom', value: { '+': [{ var: 'summaryTop' }, { '*': [{ '-': [{ len: { var: 'summaryLines' } }, 1] }, { var: 'bodyLH' }] }, 8] } },
          ],
        },
      },
      { let: 'pointsTop', value: 0 },
      {
        if: {
          cond: { truthy: { var: 'points' } },
          then: [
            { let: 'pointsTop', value: { '+': [{ var: 'bottom' }, 40] } },
            { let: 'bottom', value: { '+': [{ var: 'pointsTop' }, 44, { '*': [{ '-': [{ len: { var: 'points' } }, 1] }, { var: 'pointLH' }] }, 8] } },
          ],
        },
      },

      { let: 'signTop', value: { '+': [{ var: 'bottom' }, 40] } },
      {
        let: 'sign',
        value: {
          prim: 'signRow',
          args: {
            x: { var: 'contentX' },
            y: { var: 'signTop' },
            maxW: { '-': [{ var: 'contentW' }, { var: 'qrSize' }, 40] },
            size: 28,
            avatarD: 76,
          },
        },
      },
      { let: 'qrX', value: { '-': [{ '+': [{ var: 'contentX' }, { var: 'contentW' }] }, { var: 'qrSize' }] } },
      { let: 'cardBottom', value: { '+': [{ var: 'signTop' }, { max: [{ prim: 'qrStickerH', args: { size: { var: 'qrSize' } } }, { var: 'sign.h' }] }, 24] } },
      { let: 'height', value: { '+': [{ var: 'cardBottom' }, { var: 'cardY' }] } },

      // 这里的 '#ffffff' 不是纸白那个 token：这是"往纯白方向提亮一档"的调色参数，
      // 和 PAPER(#FFFFFF) 只是恰好同色，混档比例是 planner 里那两个 0.08 / 0.22。
      {
        emit: {
          k: 'grad', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' },
          c1: { prim: 'mix', args: { c1: { var: 'tone.bg' }, c2: '#ffffff', w: 0.08 } },
          c2: { prim: 'mix', args: { c1: { var: 'tone.bg' }, c2: '#ffffff', w: 0.22 } },
        },
      },
      { emit: { k: 'rrect', x: { var: 'cardX' }, y: { var: 'cardY' }, w: { var: 'cardW' }, h: { '-': [{ var: 'cardBottom' }, { var: 'cardY' }] }, r: { var: 'radius' }, fill: { prim: 'token', args: { name: 'paper' } }, shadow: 'rgba(35, 37, 44, 0.10)' } },
      // 色带顶边要沿卡片的圆角切、底边是方的：先画一枚四角都圆的，再用一条方角矩形盖掉下半截。
      { emit: { k: 'rrect', x: { var: 'cardX' }, y: { var: 'cardY' }, w: { var: 'cardW' }, h: { var: 'bandH' }, r: { var: 'radius' }, fill: { var: 'tone.bg' } } },
      { emit: { k: 'fill', x: { var: 'cardX' }, y: { '+': [{ var: 'cardY' }, { var: 'radius' }] }, w: { var: 'cardW' }, h: { '-': [{ var: 'bandH' }, { var: 'radius' }] }, color: { var: 'tone.bg' } } },
      { emit: { k: 'rrect', x: { var: 'contentX' }, y: { '+': [{ var: 'cardY' }, { var: 'pad' }] }, w: { var: 'block' }, h: { var: 'block' }, r: 28, fill: { var: 'tone.plate' } }, },
      // 色块里那两行字之前 planner 先切了一次字体（28 粗），那一步在 emit 段里，照抄。
      { do: { prim: 'setFont', args: { size: 28, bold: true } } },
      { let: 'blockNameClip', value: { prim: 'clipLine', args: { text: { prim: 'blockName' }, maxW: { '-': [{ var: 'block' }, 40] } } } },
      { emit: { k: 'text', x: { '+': [{ var: 'contentX' }, 20] }, y: { '+': [{ var: 'cardY' }, { var: 'pad' }, 48] }, lines: [{ var: 'blockNameClip' }], size: 28, weight: 'bold', color: { var: 'tone.ink' } } },
      { emit: { k: 'text', x: { '+': [{ var: 'contentX' }, 20] }, y: { '+': [{ var: 'cardY' }, { var: 'pad' }, { var: 'block' }, -22] }, lines: [{ prim: 'noteDate' }], size: 17, weight: 'bold', color: { var: 'tone.ink' }, alpha: 0.75 } },
      { emit: { k: 'text', x: { var: 'titleX' }, y: { '+': [{ var: 'cardY' }, { var: 'pad' }, { var: 'titleSize' }] }, lines: { var: 'titleLines' }, lh: { var: 'titleLH' }, size: { var: 'titleSize' }, weight: 'bold', color: { var: 'tone.ink' } } },
      { emit: { k: 'text', x: { var: 'contentX' }, y: { var: 'metaY' }, lines: [{ var: 'metaLine' }], size: { var: 'metaSize' }, weight: 'bold', color: { prim: 'token', args: { name: 'muted' } } } },
      {
        if: {
          cond: { truthy: { var: 'summaryLines' } },
          then: [{ emit: { k: 'text', x: { var: 'contentX' }, y: { var: 'summaryTop' }, lines: { var: 'summaryLines' }, lh: { var: 'bodyLH' }, size: { var: 'bodySize' }, color: { prim: 'token', args: { name: 'body' } } } }],
        },
      },
      {
        if: {
          cond: { truthy: { var: 'points' } },
          then: [
            { emit: { k: 'text', x: { var: 'contentX' }, y: { var: 'pointsTop' }, lines: [{ prim: 'i18n', args: { key: 'keyPoints' } }], size: { var: 'metaSize' }, weight: 'bold', color: { prim: 'token', args: { name: 'muted' } } } },
            {
              each: {
                over: { var: 'points' }, as: 'p', index: 'pi',
                do: [
                  { let: 'py', value: { '+': [{ var: 'pointsTop' }, 44, { '*': [{ var: 'pi' }, { var: 'pointLH' }] }] } },
                  { emit: { k: 'circle', x: { '+': [{ var: 'contentX' }, 18] }, y: { '+': [{ var: 'py' }, -9] }, r: 18, fill: { var: 'tone.bg' } } },
                  { emit: { k: 'text', x: { '+': [{ var: 'contentX' }, 18] }, y: { '+': [{ var: 'py' }, -2] }, lines: [{ str: { '+': [{ var: 'pi' }, 1] } }], size: 21, weight: 'bold', color: { var: 'tone.ink' }, align: 'center' } },
                  { emit: { k: 'text', x: { '+': [{ var: 'contentX' }, 50] }, y: { var: 'py' }, lines: [{ var: 'p' }], size: { var: 'pointSize' }, color: { prim: 'token', args: { name: 'body' } } } },
                ],
              },
            },
          ],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      {
        let: 'qr',
        value: {
          prim: 'qrSticker',
          args: {
            x: { var: 'qrX' }, y: { var: 'signTop' }, size: { var: 'qrSize' },
            offset: { var: 'tone.bg' }, ink: { prim: 'token', args: { name: 'muted' } },
            label: { prim: 'i18n', args: { key: 'scanToView' } },
          },
        },
      },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 叠翠：上半截整块分类色，头像压在色块与白卡的交界上，白卡里是要点，码贴纸在卡外。
  block: {
    id: 'block',
    min_version: 1,
    steps: [
      { let: 'tone', value: { prim: 'paperOf', args: { categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 44 },
      { let: 'qrSize', value: 120 },
      { let: 'avatarD', value: 132 },
      { let: 'cardX', value: 40 },
      { let: 'cardW', value: { '-': [{ var: 'W' }, { '*': [{ var: 'cardX' }, 2] }] } },
      { let: 'innerW', value: { '-': [{ var: 'cardW' }, { '*': [{ var: 'pad' }, 2] }] } },

      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 3, size: 40, bold: true } } },
      {
        let: 'metaLine',
        value: {
          prim: 'clipLine',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'sourceLabel' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] },
            size: 22,
            bold: true,
          },
        },
      },
      { let: 'metaY', value: 92 },
      { let: 'titleTop', value: { '+': [{ var: 'metaY' }, 52] } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 54] }, 40] } },
      // 头像压在色块与白卡那条边上，所以色块下沿留出一截，白卡再从下沿下方起
      { let: 'bandBottom', value: { '+': [{ var: 'titleBottom' }, 96] } },
      { let: 'cardTop', value: { '+': [{ var: 'bandBottom' }, 40] } },
      { let: 'contentTop', value: { if: [{ truthy: { var: 'hasAvatar' } }, { '+': [{ var: 'cardTop' }, { '/': [{ var: 'avatarD' }, 2] }, 24] }, { '+': [{ var: 'cardTop' }, { var: 'pad' }] }] } },

      { do: { prim: 'setFont', args: { size: 27 } } },
      { let: 'summaryLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'summaryLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { var: 'innerW' }, n: 4 } } }] } },
      { let: 'points', value: { prim: 'points', args: { limit: 3, maxW: { '-': [{ var: 'innerW' }, 46] }, size: 26 } } },

      { let: 'base', value: { '+': [{ var: 'contentTop' }, 27] } },
      { let: 'summaryY', value: { if: [{ truthy: { var: 'summaryLines' } }, { var: 'base' }, 0] } },
      { if: { cond: { truthy: { var: 'summaryLines' } }, then: [{ let: 'base', value: { '+': [{ var: 'base' }, { '*': [{ '-': [{ len: { var: 'summaryLines' } }, 1] }, 40] }, 40] } }] } },
      { let: 'pointsY', value: { if: [{ truthy: { var: 'points' } }, { '+': [{ var: 'base' }, 8] }, 0] } },
      { if: { cond: { truthy: { var: 'points' } }, then: [{ let: 'base', value: { '+': [{ var: 'pointsY' }, 40, { '*': [{ '-': [{ len: { var: 'points' } }, 1] }, 42] }, 26] } }] } },
      // 这一套在色块与白卡交界已经画了一枚大头像，署名行再带一枚就成两个自己了，所以 hasAvatar 钉死 false
      { let: 'sign', value: { prim: 'signRow', args: { x: { '+': [{ var: 'cardX' }, { var: 'pad' }] }, y: { '+': [{ var: 'base' }, 36] }, maxW: { var: 'innerW' }, size: 28, avatarD: 76, hasAvatar: false } } },
      { let: 'cardBottom', value: { '+': [{ if: [{ truthy: { var: 'sign.h' } }, { '+': [{ var: 'base' }, 36, { var: 'sign.h' }, 12] }, { '+': [{ var: 'base' }, 8] }] }, { var: 'pad' }] } },
      { let: 'qrY', value: { '+': [{ var: 'cardBottom' }, 44] } },
      { let: 'height', value: { '+': [{ var: 'qrY' }, { prim: 'qrStickerH', args: { size: { var: 'qrSize' } } }, 24] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: '#F5F4F0' } },
      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'bandBottom' }, color: { var: 'tone.bg' } } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { var: 'metaY' }, lines: [{ var: 'metaLine' }], size: 22, weight: 'bold', color: { var: 'tone.ink' }, alpha: 0.8 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 40] }, lines: { var: 'titleLines' }, lh: 54, size: 40, weight: 'bold', color: { var: 'tone.ink' } } },
      { emit: { k: 'rrect', x: { var: 'cardX' }, y: { var: 'cardTop' }, w: { var: 'cardW' }, h: { '-': [{ var: 'cardBottom' }, { var: 'cardTop' }] }, r: 44, fill: { prim: 'token', args: { name: 'paper' } }, shadow: 'rgba(35, 37, 44, 0.10)' } },
      { if: { cond: { truthy: { var: 'hasAvatar' } }, then: [{ emit: { k: 'avatar', x: { '/': [{ '-': [{ var: 'W' }, { var: 'avatarD' }] }, 2] }, y: { '-': [{ var: 'bandBottom' }, { '/': [{ var: 'avatarD' }, 2] }] }, d: { var: 'avatarD' }, ring: 8, ringColor: { prim: 'token', args: { name: 'paper' } } } }] } },
      { if: { cond: { truthy: { var: 'summaryLines' } }, then: [{ emit: { k: 'text', x: { '+': [{ var: 'cardX' }, { var: 'pad' }] }, y: { var: 'summaryY' }, lines: { var: 'summaryLines' }, lh: 40, size: 27, color: { prim: 'token', args: { name: 'body' } } } }] } },
      {
        if: {
          cond: { truthy: { var: 'points' } },
          then: [{
            each: {
              over: { var: 'points' }, as: 'p', index: 'pi',
              do: [
                { let: 'py', value: { '+': [{ var: 'pointsY' }, { '*': [{ var: 'pi' }, 42] }] } },
                { emit: { k: 'circle', x: { '+': [{ var: 'cardX' }, { var: 'pad' }, 16] }, y: { '+': [{ var: 'py' }, -9] }, r: 16, fill: { var: 'tone.bg' } } },
                { emit: { k: 'text', x: { '+': [{ var: 'cardX' }, { var: 'pad' }, 16] }, y: { '+': [{ var: 'py' }, -2] }, lines: [{ str: { '+': [{ var: 'pi' }, 1] } }], size: 20, weight: 'bold', color: { var: 'tone.ink' }, align: 'center' } },
                { emit: { k: 'text', x: { '+': [{ var: 'cardX' }, { var: 'pad' }, 46] }, y: { var: 'py' }, lines: [{ var: 'p' }], size: 26, color: { prim: 'token', args: { name: 'body' } } } },
              ],
            },
          }],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      {
        let: 'qr',
        value: {
          prim: 'qrSticker',
          args: {
            x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'qrY' }, size: { var: 'qrSize' },
            offset: { var: 'tone.bg' }, ink: { prim: 'token', args: { name: 'muted' } },
            label: { prim: 'i18n', args: { key: 'scanToView' } },
          },
        },
      },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 纸间文艺：上半截一枚拱门（形象图或品牌占位字），眉标带字距，右边一列竖排写来源。
  lit: {
    id: 'lit',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'riso', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 56 },
      { let: 'archW', value: 380 },
      { let: 'archH', value: 380 },
      { let: 'archX', value: { '/': [{ '-': [{ var: 'W' }, { var: 'archW' }] }, 2] } },
      { let: 'vertX', value: { '-': [{ var: 'W' }, 44] } },
      { let: 'contentCx', value: { '/': [{ '-': [{ var: 'W' }, 68] }, 2] } },
      { let: 'qrSize', value: 108 },

      {
        let: 'kicker',
        value: {
          prim: 'clipTrack',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] },
            track: 6,
            size: 20,
            bold: true,
            fam: { prim: 'token', args: { name: 'serif' } },
          },
        },
      },
      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 60] }, n: 3, size: 52, bold: true, fam: { prim: 'token', args: { name: 'serif' } } } } },
      // 摘要那一档先切字体（不带字体族，就是 sans），量不量按有没有摘要
      { do: { prim: 'setFont', args: { size: 27 } } },
      { let: 'sumLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'sumLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 50] }, n: 3 } } }] } },
      // 竖排那一列写来源；没有来源标签就退回日期。slogan 不写在这里——它已经在署名行里了，
      // 同一句话出现两次很廉价（planner 里那句注释的原话）。
      { let: 'vertText', value: { slice: [{ if: [{ truthy: { prim: 'sourceLabel' } }, { prim: 'sourceLabel' }, { prim: 'noteDate' }] }, 0, 10] } },
      { let: 'vertStep', value: 40 },

      { let: 'archTop', value: 92 },
      { let: 'kickerY', value: { '+': [{ var: 'archTop' }, { var: 'archH' }, 76] } },
      { let: 'titleTop', value: { '+': [{ var: 'kickerY' }, 40] } },
      { let: 'vertTop', value: { var: 'titleTop' } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 74] }, 52] } },
      { let: 'ruleY', value: { '+': [{ var: 'titleBottom' }, 46] } },
      { let: 'sumTop', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'ruleY' }, 44] }, 0] } },
      { let: 'sumBottom', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'sumTop' }, { '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 42] }, 27] }, { var: 'ruleY' }] } },
      { let: 'signTop', value: { '+': [{ max: [{ var: 'sumBottom' }, { '+': [{ var: 'vertTop' }, { '*': [{ len: { var: 'vertText' } }, { var: 'vertStep' }] }] }] }, 52] } },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 72, hasAvatar: false } } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ var: 'sign.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] }, 48] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 's.bg' } } },
      // 拱门：四角全圆的长条 + 一条方角矩形盖住下半截的圆角
      { emit: { k: 'rrect', x: { var: 'archX' }, y: { var: 'archTop' }, w: { var: 'archW' }, h: { var: 'archH' }, r: { '/': [{ var: 'archW' }, 2] }, fill: { var: 's.accent' } } },
      { emit: { k: 'fill', x: { var: 'archX' }, y: { '+': [{ var: 'archTop' }, { var: 'archH' }, { '/': [{ var: 'archW' }, -2] }] }, w: { var: 'archW' }, h: { '/': [{ var: 'archW' }, 2] }, color: { var: 's.accent' } } },
      { let: 'badge', value: 220 },
      {
        if: {
          cond: { truthy: { var: 'hasAvatar' } },
          then: [{ emit: { k: 'avatar', x: { '+': [{ var: 'archX' }, { '/': [{ '-': [{ var: 'archW' }, { var: 'badge' }] }, 2] }] }, y: { '+': [{ var: 'archTop' }, 56] }, d: { var: 'badge' }, ring: 8, ringColor: { var: 's.bg' }, fallback: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.3 } } } }],
          else: [{ emitOne: { prim: 'glyphPlate', args: { x: { var: 'archX' }, y: { var: 'archTop' }, w: { var: 'archW' }, h: { var: 'archH' }, color: { prim: 'withAlpha', args: { color: { var: 's.accentInk' }, alpha: 0.22 } } } } }],
        },
      },
      { emit: { k: 'text', x: { var: 'contentCx' }, y: { var: 'kickerY' }, lines: [{ var: 'kicker' }], size: 20, weight: 'bold', color: { var: 's.sub' }, track: 6, align: 'center', fam: { prim: 'token', args: { name: 'serif' } } } },
      { emit: { k: 'text', x: { var: 'contentCx' }, y: { '+': [{ var: 'titleTop' }, 52] }, lines: { var: 'titleLines' }, lh: 74, size: 52, weight: 'bold', color: { var: 's.ink' }, align: 'center', fam: { prim: 'token', args: { name: 'serif' } } } },
      { emit: { k: 'line', x1: { var: 'pad' }, y1: { var: 'ruleY' }, x2: { '-': [{ var: 'W' }, { var: 'pad' }] }, y2: { var: 'ruleY' }, w: 2, color: { prim: 'withAlpha', args: { color: { var: 's.ink' }, alpha: 0.18 } } } },
      { if: { cond: { truthy: { var: 'sumLines' } }, then: [{ emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'sumTop' }, 27] }, lines: { var: 'sumLines' }, lh: 42, size: 27, color: { prim: 'mix', args: { c1: { var: 's.ink' }, c2: { var: 's.bg' }, w: 0.78 } } } }] } },
      { emit: { k: 'text', x: { var: 'vertX' }, y: { var: 'vertTop' }, lines: [{ var: 'vertText' }], vert: true, lh: { var: 'vertStep' }, size: 28, color: { prim: 'withAlpha', args: { color: { var: 's.ink' }, alpha: 0.62 } }, fam: { prim: 'token', args: { name: 'serif' } } } },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: { var: 's.sub' }, label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 规格卡：等宽字眉标 + 一条横向色条 + 序号成表，正文多出来的空白对半分（竖版有下限）。
  spec: {
    id: 'spec',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'spec', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 52 },
      { let: 'qrSize', value: 112 },
      { let: 'rule', value: { prim: 'withAlpha', args: { color: { var: 's.ink' }, alpha: 0.14 } } },
      { let: 'SPEC_MIN_H', value: 1040 },
      { let: 'innerW', value: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] } },

      {
        let: 'meta',
        value: {
          prim: 'clipTrack',
          args: {
            text: {
              prim: 'joinNonEmpty',
              args: {
                sep: '  /  ',
                // NO.007 那种编号：id 取模三位、前面补零。'NO.' 走 joinNonEmpty 拼而不是 '+'，
                // 因为 '+' 在这个解释器里只算数（把字符串静默变数字会更难查）。
                parts: [{ prim: 'joinNonEmpty', args: { sep: '', parts: ['NO.', { padStart: [{ str: { '%': [{ var: 'note.id' }, 1000] } }, 3] }] } }, { prim: 'noteDate' }, { prim: 'sourceLabel' }],
              },
            },
            maxW: { var: 'innerW' },
            track: 1,
            size: 20,
            fam: { prim: 'token', args: { name: 'mono' } },
          },
        },
      },
      { let: 'kicker', value: { prim: 'clipTrack', args: { text: { prim: 'blockName' }, maxW: { var: 'innerW' }, track: 5, size: 20, bold: true } } },
      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { var: 'innerW' }, n: 3, size: 60, bold: true } } },
      // 摘要与要点各切一次字体（planner 里就是连着两次 font(26,false)），少一次序列就短一步
      { do: { prim: 'setFont', args: { size: 26 } } },
      { let: 'sumLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'sumLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { '-': [{ var: 'innerW' }, 60] }, n: 3 } } }] } },
      { let: 'points', value: { prim: 'points', args: { limit: 4, maxW: { '-': [{ var: 'innerW' }, 150] }, size: 26 } } },

      { let: 'metaY', value: { '+': [{ var: 'pad' }, 20] } },
      { let: 'barY', value: { '+': [{ var: 'metaY' }, 26] } },
      { let: 'kickerY', value: { '+': [{ var: 'barY' }, 56] } },
      { let: 'titleTop', value: { '+': [{ var: 'kickerY' }, 34] } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 74] }, 60] } },
      { let: 'y', value: { '+': [{ var: 'titleBottom' }, 44] } },
      { let: 'sumTop', value: { if: [{ truthy: { var: 'sumLines' } }, { var: 'y' }, 0] } },
      { if: { cond: { truthy: { var: 'sumLines' } }, then: [{ let: 'y', value: { '+': [{ var: 'y' }, { '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 40] }, 76] } }] } },
      { let: 'listTop', value: { if: [{ truthy: { var: 'points' } }, { var: 'y' }, 0] } },
      { if: { cond: { truthy: { var: 'points' } }, then: [{ let: 'y', value: { '+': [{ var: 'y' }, { '*': [{ len: { var: 'points' } }, 74] }] } }] } },
      // 先拿一枚 y=0 的署名量一次高度（它只读 .h），再算画布，最后才是真落笔那一次
      { let: 'probe', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: 0, maxW: { '-': [{ var: 'innerW' }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 76 } } },
      { let: 'foot', value: { max: [{ var: 'probe.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] } },
      // 只有一条要点的笔记会让这张变成横图，所以给一个竖版下限；多出来的空白对半分。
      { let: 'natural', value: { '+': [{ var: 'y' }, 40, { var: 'foot' }, 48] } },
      { let: 'height', value: { max: [{ var: 'natural' }, { var: 'SPEC_MIN_H' }] } },
      { let: 'bodyShift', value: { round: [{ '*': [{ '-': [{ var: 'height' }, { var: 'natural' }] }, 0.5] }] } },
      { let: 'signTop', value: { '-': [{ var: 'height' }, 48, { var: 'foot' }] } },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'innerW' }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 76 } } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 's.bg' } } },
      { emit: { k: 'grad', x: { var: 'pad' }, y: { var: 'barY' }, w: { var: 'innerW' }, h: 10, c1: { var: 's.accent' }, c2: { prim: 'withAlpha', args: { color: { var: 's.accent' }, alpha: 0.1 } }, dir: 'h' } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { var: 'metaY' }, lines: [{ var: 'meta' }], size: 20, color: { var: 's.sub' }, fam: { prim: 'token', args: { name: 'mono' } }, track: 1 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { var: 'kickerY' }, lines: [{ var: 'kicker' }], size: 20, weight: 'bold', color: { var: 's.accent' }, track: 5 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 60] }, lines: { var: 'titleLines' }, lh: 74, size: 60, weight: 'bold', color: { var: 's.ink' } } },
      { if: { cond: { truthy: { var: 'sumLines' } }, then: [{ emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'sumTop' }, 26, { var: 'bodyShift' }] }, lines: { var: 'sumLines' }, lh: 40, size: 26, color: { prim: 'mix', args: { c1: { var: 's.ink' }, c2: { var: 's.bg' }, w: 0.78 } } } }] } },
      {
        each: {
          over: { var: 'points' }, as: 'p', index: 'pi',
          do: [
            { let: 'py', value: { '+': [{ var: 'listTop' }, { var: 'bodyShift' }, { '*': [{ var: 'pi' }, 74] }] } },
            { emit: { k: 'line', x1: { var: 'pad' }, y1: { '+': [{ var: 'py' }, -30] }, x2: { '-': [{ var: 'W' }, { var: 'pad' }] }, y2: { '+': [{ var: 'py' }, -30] }, w: 1.5, color: { var: 'rule' } } },
            { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'py' }, 4] }, lines: [{ padStart: [{ str: { '+': [{ var: 'pi' }, 1] } }, 2] }], size: 22, color: { var: 's.accent' }, fam: { prim: 'token', args: { name: 'mono' } }, weight: 'bold' } },
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 62] }, y: { '+': [{ var: 'py' }, 4] }, lines: [{ var: 'p' }], size: 26, color: { prim: 'mix', args: { c1: { var: 's.ink' }, c2: { var: 's.bg' }, w: 0.86 } } } },
          ],
        },
      },
      {
        if: {
          cond: { truthy: { var: 'points' } },
          then: [
            { let: 'endY', value: { '+': [{ var: 'listTop' }, { var: 'bodyShift' }, { '*': [{ len: { var: 'points' } }, 74] }, -30] } },
            { emit: { k: 'line', x1: { var: 'pad' }, y1: { var: 'endY' }, x2: { '-': [{ var: 'W' }, { var: 'pad' }] }, y2: { var: 'endY' }, w: 1.5, color: { var: 'rule' } } },
          ],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: { var: 's.sub' }, label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },
}
