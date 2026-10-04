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

  // 波普四格：黑底上四块版色，形象图转灰后各自压一层半透明版色当四遍套印。
  popGrid: {
    id: 'popGrid',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'pop', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 44 },
      { let: 'gut', value: 10 },
      { let: 'cellW', value: { '/': [{ '-': [{ var: 'W' }, { var: 'gut' }] }, 2] } },
      { let: 'cellH', value: 296 },
      { let: 'gridH', value: { '+': [{ '*': [{ var: 'cellH' }, 2] }, { var: 'gut' }] } },
      { let: 'qrSize', value: 118 },
      { let: 'plates', value: { prim: 'plateColors', args: { categoryId: { var: 'note.category_id' } } } },

      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 2, size: 58, bold: true } } },
      { do: { prim: 'setFont', args: { size: 24 } } },
      { let: 'sumLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'sumLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 2 } } }] } },
      {
        let: 'kicker',
        value: {
          prim: 'clipTrack',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] },
            track: 3,
            size: 22,
            bold: true,
          },
        },
      },

      { let: 'kickerY', value: { '+': [{ var: 'gridH' }, 76] } },
      { let: 'titleTop', value: { '+': [{ var: 'kickerY' }, 34] } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 70] }, 58] } },
      { let: 'sumTop', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'titleBottom' }, 26] }, 0] } },
      { let: 'sumBottom', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'sumTop' }, { '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 36] }, 24] }, { var: 'titleBottom' }] } },
      { let: 'signTop', value: { '+': [{ var: 'sumBottom' }, 44] } },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 74, onDark: true } } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ var: 'sign.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] }, 48] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { prim: 'token', args: { name: 'hard' } } } },
      {
        each: {
          over: { var: 'plates' }, as: 'c', index: 'pi',
          do: [
            { let: 'px', value: { '*': [{ '%': [{ var: 'pi' }, 2] }, { '+': [{ var: 'cellW' }, { var: 'gut' }] }] } },
            { let: 'py', value: { '*': [{ floor: { '/': [{ var: 'pi' }, 2] } }, { '+': [{ var: 'cellH' }, { var: 'gut' }] }] } },
            { emit: { k: 'fill', x: { var: 'px' }, y: { var: 'py' }, w: { var: 'cellW' }, h: { var: 'cellH' }, color: { var: 'c' } } },
            {
              if: {
                cond: { var: 'hasAvatar' },
                then: [{ emit: { k: 'image', key: 'avatar', x: { var: 'px' }, y: { var: 'py' }, w: { var: 'cellW' }, h: { var: 'cellH' }, gray: true, tint: { prim: 'withAlpha', args: { color: { var: 'c' }, alpha: 0.62 } } } }],
                else: [{ emitOne: { prim: 'glyphPlate', args: { x: { var: 'px' }, y: { var: 'py' }, w: { var: 'cellW' }, h: { var: 'cellH' }, color: { prim: 'withAlpha', args: { color: { prim: 'token', args: { name: 'hard' } }, alpha: 0.2 } } } } }],
              },
            },
          ],
        },
      },
      { emit: { k: 'text', x: { var: 'pad' }, y: { var: 'kickerY' }, lines: [{ var: 'kicker' }], size: 22, weight: 'bold', color: { var: 's.bg' }, track: 3 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 58] }, lines: { var: 'titleLines' }, lh: 70, size: 58, weight: 'bold', color: { prim: 'token', args: { name: 'paper' } } } },
      // 这两处白不是 token：PAPER 是"纸"，这两处是"压在黑底上的一档白字色"，planner 里就是写死的 rgba。
      { if: { cond: { truthy: { var: 'sumLines' } }, then: [{ emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'sumTop' }, 24] }, lines: { var: 'sumLines' }, lh: 36, size: 24, color: 'rgba(255,255,255,0.7)' } }] } },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: 'rgba(255,255,255,0.66)', label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 网点波普：上半截网点天，标题套印错位画两遍，白卡带硬偏移，序号点走白底。
  popDots: {
    id: 'popDots',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'pop', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 46 },
      { let: 'avatarD', value: 200 },
      { let: 'qrSize', value: 116 },
      { let: 'light', value: { prim: 'mix', args: { c1: { var: 's.bg' }, c2: '#FFFFFF', w: 0.66 } } },
      // 主墨往 HARD 里渗这组的底色：权重是 HARD 的占比，写反过一次，描边就成了亮蓝。
      { let: 'dark', value: { prim: 'mix', args: { c1: { prim: 'token', args: { name: 'hard' } }, c2: { var: 's.bg' }, w: 0.85 } } },

      {
        let: 'kicker',
        value: {
          prim: 'clipTrack',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'sourceLabel' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'avatarD' }, 24] },
            track: 2,
            size: 22,
            bold: true,
          },
        },
      },
      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 3, size: 76, bold: true } } },
      { do: { prim: 'setFont', args: { size: 26 } } },
      { let: 'sumLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'sumLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 56] }, n: 3 } } }] } },
      { let: 'points', value: { prim: 'points', args: { limit: 2, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 120] }, size: 25 } } },

      { let: 'kickerY', value: 100 },
      { let: 'titleTop', value: { '+': [{ max: [{ '+': [{ var: 'kickerY' }, 60] }, { '+': [{ var: 'avatarD' }, 56] }] }, 76] } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 88] }, 76] } },
      { let: 'cardTop', value: { '+': [{ var: 'titleBottom' }, 40] } },
      { let: 'cardH', value: { '+': [44, { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 40] }, 34, 22] }, 0] }, { if: [{ truthy: { var: 'points' } }, { '*': [{ len: { var: 'points' } }, 44] }, 0] }, 20] } },
      { let: 'signTop', value: { '+': [{ var: 'cardTop' }, { var: 'cardH' }, 44] } },
      // 上面已经有一枚大头像了，署名行只留字：同一张脸上出现两次自己很难看
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 74, hasAvatar: false } } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ var: 'sign.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] }, 48] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 'light' } } },
      { emit: { k: 'dots', x: 0, y: 0, w: { var: 'W' }, h: { '-': [{ var: 'cardTop' }, 20] }, gap: 26, r: 4.5, color: { var: 's.dot' }, oddRowShift: 13 } },
      // 套印错位：同一句标题先按强调色往右下偏 9px 画一遍，再用主墨色压在原位画
      { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 13] }, y: { '+': [{ var: 'titleTop' }, 89] }, lines: { var: 'titleLines' }, lh: 88, size: 76, weight: 'bold', color: { var: 's.accent' } } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 76] }, lines: { var: 'titleLines' }, lh: 88, size: 76, weight: 'bold', color: { var: 'dark' } } },
      { emit: { k: 'rrect', x: { '-': [{ var: 'pad' }, 8] }, y: { '-': [{ var: 'kickerY' }, 30] }, w: { '+': [{ prim: 'trackWidth', args: { text: { var: 'kicker' }, track: 2 } }, 32] }, h: 44, r: 22, fill: { var: 's.accent' } } },
      { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 8] }, y: { var: 'kickerY' }, lines: [{ var: 'kicker' }], size: 22, weight: 'bold', color: { var: 's.accentInk' }, track: 2 } },
      {
        if: {
          cond: { var: 'hasAvatar' },
          then: [{ emit: { k: 'avatar', x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'avatarD' }] }, y: 40, d: { var: 'avatarD' }, ring: 10, ringColor: { var: 'dark' }, fallback: { prim: 'withAlpha', args: { color: { var: 'dark' }, alpha: 0.16 } } } }],
          else: [{ emitOne: { prim: 'glyphPlate', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'avatarD' }] }, y: 40, w: { var: 'avatarD' }, h: { var: 'avatarD' }, color: { prim: 'withAlpha', args: { color: { var: 'dark' }, alpha: 0.18 } } } } }],
        },
      },
      { emit: { k: 'rrect', x: { '+': [{ var: 'pad' }, 12] }, y: { '+': [{ var: 'cardTop' }, 12] }, w: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, h: { var: 'cardH' }, r: 28, fill: { prim: 'withAlpha', args: { color: { var: 'dark' }, alpha: 0.9 } } } },
      { emit: { k: 'rrect', x: { var: 'pad' }, y: { var: 'cardTop' }, w: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, h: { var: 'cardH' }, r: 28, fill: { prim: 'token', args: { name: 'paper' } }, stroke: { var: 'dark' }, strokeWidth: 4 } },
      { let: 'cy', value: { '+': [{ var: 'cardTop' }, 44] } },
      {
        if: {
          cond: { truthy: { var: 'sumLines' } },
          then: [
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 28] }, y: { var: 'cy' }, lines: { var: 'sumLines' }, lh: 40, size: 26, color: { prim: 'token', args: { name: 'body' } } } },
            { let: 'cy', value: { '+': [{ var: 'cy' }, { '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 40] }, 56] } },
          ],
        },
      },
      {
        each: {
          over: { var: 'points' }, as: 'p', index: 'pi',
          do: [
            { let: 'py', value: { '+': [{ var: 'cy' }, { '*': [{ var: 'pi' }, 44] }] } },
            // 序号点用白底：这组的底色本身就有浅的，蓝底压蓝字的"1"根本认不出来
            { emit: { k: 'circle', x: { '+': [{ var: 'pad' }, 46] }, y: { '+': [{ var: 'py' }, -9] }, r: 18, fill: { prim: 'token', args: { name: 'paper' } }, stroke: { var: 'dark' }, strokeWidth: 3 } },
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 46] }, y: { '+': [{ var: 'py' }, -2] }, lines: [{ str: { '+': [{ var: 'pi' }, 1] } }], size: 20, weight: 'bold', color: { var: 'dark' }, align: 'center' } },
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 78] }, y: { var: 'py' }, lines: [{ var: 'p' }], size: 25, color: { prim: 'token', args: { name: 'ink' } } } },
          ],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: { var: 'dark' }, label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 荧光渐变：人像后面托一团径向光，下半截压一层暗，要点走胶囊底。
  acid: {
    id: 'acid',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'neon', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 48 },
      { let: 'avatarD', value: 380 },
      { let: 'qrSize', value: 118 },
      { let: 'topH', value: 540 },
      { let: 'pillGap', value: 84 },

      {
        let: 'kicker',
        value: {
          prim: 'clipTrack',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] },
            track: 4,
            size: 22,
            bold: true,
          },
        },
      },
      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 2, size: 72, bold: true } } },
      { let: 'points', value: { prim: 'points', args: { limit: 3, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 76] }, size: 25 } } },

      { let: 'avatarTop', value: 76 },
      { let: 'kickerY', value: { '+': [{ var: 'topH' }, 74] } },
      { let: 'titleTop', value: { '+': [{ var: 'kickerY' }, 44] } },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 88] }, 72] } },
      { let: 'pointsTop', value: { '+': [{ var: 'titleBottom' }, 44] } },
      { let: 'signTop', value: { '+': [{ var: 'pointsTop' }, { '*': [{ len: { var: 'points' } }, { var: 'pillGap' }] }, { if: [{ truthy: { var: 'points' } }, 24, 0] }] } },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 30] }, size: 28, avatarD: 74, onDark: true, hasAvatar: false } } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ var: 'sign.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] }, 48] } },

      {
        emit: {
          k: 'grad', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, c1: { var: 's.c1' }, c2: { var: 's.c2' },
          stops: [
            { obj: { at: 0, color: { var: 's.c1' } } },
            { obj: { at: 0.52, color: { prim: 'mix', args: { c1: { var: 's.c1' }, c2: { var: 's.c2' }, w: 0.5 } } } },
            { obj: { at: 1, color: { var: 's.c2' } } },
          ],
        },
      },
      // 人像后面那团光：径向从半透明白走到全透，把大圆从渐变里"托"出来
      { emit: { k: 'radial', x: { '-': [{ var: 'W' }, { var: 'pad' }, { '/': [{ var: 'avatarD' }, 2] }] }, y: { '+': [{ var: 'avatarTop' }, { '/': [{ var: 'avatarD' }, 2] }] }, r0: 0, r1: { '*': [{ var: 'avatarD' }, 1.05] }, c1: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0.38 } }, c2: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0 } }, box: [0, 0, { var: 'W' }, { var: 'topH' }] } },
      { emit: { k: 'fill', x: 0, y: { '-': [{ var: 'topH' }, 1] }, w: { var: 'W' }, h: { '+': [{ '-': [{ var: 'height' }, { var: 'topH' }] }, 1] }, color: { prim: 'withAlpha', args: { color: { prim: 'token', args: { name: 'hard' } }, alpha: 0.28 } } } },
      {
        if: {
          cond: { var: 'hasAvatar' },
          then: [{ emit: { k: 'avatar', x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'avatarD' }] }, y: { var: 'avatarTop' }, d: { var: 'avatarD' }, ring: 6, ringColor: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0.6 } }, fallback: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0.2 } } } }],
          else: [{ emitOne: { prim: 'glyphPlate', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'avatarD' }] }, y: { var: 'avatarTop' }, w: { var: 'avatarD' }, h: { var: 'avatarD' }, color: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0.28 } } } } }],
        },
      },
      { emit: { k: 'text', x: { var: 'pad' }, y: { var: 'kickerY' }, lines: [{ var: 'kicker' }], size: 22, weight: 'bold', color: { var: 's.sub' }, track: 4 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 72] }, lines: { var: 'titleLines' }, lh: 88, size: 72, weight: 'bold', color: { var: 's.ink' } } },
      {
        each: {
          over: { var: 'points' }, as: 'p', index: 'pi',
          do: [
            { let: 'py', value: { '+': [{ var: 'pointsTop' }, { '*': [{ var: 'pi' }, { var: 'pillGap' }] }] } },
            { emit: { k: 'rrect', x: { var: 'pad' }, y: { '+': [{ var: 'py' }, -34] }, w: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, h: 76, r: 38, fill: { prim: 'withAlpha', args: { color: '#FFFFFF', alpha: 0.14 } } } },
            { emit: { k: 'circle', x: { '+': [{ var: 'pad' }, 30] }, y: { var: 'py' }, r: 22, fill: { var: 's.accent' } } },
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 30] }, y: { '+': [{ var: 'py' }, 8] }, lines: [{ str: { '+': [{ var: 'pi' }, 1] } }], size: 22, weight: 'bold', color: { var: 's.accentInk' }, align: 'center' } },
            { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 66] }, y: { '+': [{ var: 'py' }, 9] }, lines: [{ var: 'p' }], size: 25, color: { var: 's.panelInk' } } },
          ],
        },
      },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: 'rgba(255,255,255,0.72)', label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 杂志封面：整幅彩色人像铺满，一条上淡下浓的渐变把标题那一段压住，眉标坐在半透明药丸里。
  cover: {
    id: 'cover',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'mono', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 48 },
      { let: 'qrSize', value: 116 },

      {
        let: 'mast',
        value: {
          prim: 'clipTrack',
          args: {
            text: { prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } },
            maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, 40] },
            track: 4,
            size: 20,
            bold: true,
          },
        },
      },
      { let: 'titleLines', value: { prim: 'fitLines', args: { text: { var: 'note.title' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 2, size: 76, bold: true } } },
      { do: { prim: 'setFont', args: { size: 26 } } },
      { let: 'sumLines', value: [] },
      { if: { cond: { truthy: { var: 'note.summary' } }, then: [{ let: 'sumLines', value: { prim: 'fitLines', args: { text: { var: 'note.summary' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }] }, n: 2 } } }] } },

      { let: 'mastY', value: { '+': [{ var: 'pad' }, 20] } },
      { let: 'titleTop', value: 796 },
      { let: 'titleBottom', value: { '+': [{ var: 'titleTop' }, { '*': [{ '-': [{ len: { var: 'titleLines' } }, 1] }, 90] }, 76] } },
      { let: 'sumTop', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'titleBottom' }, 30] }, 0] } },
      { let: 'sumBottom', value: { if: [{ truthy: { var: 'sumLines' } }, { '+': [{ var: 'sumTop' }, { '*': [{ '-': [{ len: { var: 'sumLines' } }, 1] }, 40] }, 26] }, { var: 'titleBottom' }] } },
      { let: 'signTop', value: { '+': [{ var: 'sumBottom' }, 52] } },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 30] }, size: 30, avatarD: 80, onDark: true } } },
      { let: 'height', value: { '+': [{ var: 'signTop' }, { max: [{ var: 'sign.h' }, { prim: 'footH', args: { qrSize: { var: 'qrSize' } } }] }, 48] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 's.bg' } } },
      {
        if: {
          cond: { var: 'hasAvatar' },
          then: [
            // 彩色整幅人像铺满全张，眉标、标题、署名、码全部压在图上。压得住靠这条渐变：
            // 脸那一段几乎不加暗，到标题那一段已经到 0.88，白字落在浅色衣服或白墙上也不会糊掉。
            { emit: { k: 'image', key: 'avatar', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' } } },
            {
              emit: {
                k: 'grad', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' },
                c1: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.2 } },
                c2: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.97 } },
                stops: [
                  { obj: { at: 0, color: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.2 } } } },
                  { obj: { at: 0.5, color: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.42 } } } },
                  { obj: { at: 0.66, color: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.88 } } } },
                  { obj: { at: 1, color: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0.97 } } } },
                ],
              },
            },
          ],
          else: [
            { emit: { k: 'radial', x: { '/': [{ var: 'W' }, 2] }, y: { '*': [{ var: 'height' }, 0.34] }, r0: 0, r1: { '*': [{ var: 'height' }, 0.62] }, c1: { prim: 'withAlpha', args: { color: { var: 's.accent' }, alpha: 0.34 } }, c2: { prim: 'withAlpha', args: { color: { var: 's.bg' }, alpha: 0 } }, box: [0, 0, { var: 'W' }, { var: 'height' }] } },
            { emitOne: { prim: 'glyphPlate', args: { x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { prim: 'withAlpha', args: { color: { var: 's.ink' }, alpha: 0.1 } } } } },
          ],
        },
      },
      // 药丸的宽度要量眉标实际占多宽：这一步沿用当前字体（上面最后一次切字体就是 26 那档），
      // 所以不传 size——传了就会多切一次字体，绘制序列比基线多一步。
      { let: 'mastW', value: { '+': [{ prim: 'trackWidth', args: { text: { var: 'mast' }, track: 4 } }, 40] } },
      { emit: { k: 'rrect', x: { var: 'pad' }, y: { '-': [{ var: 'mastY' }, 30] }, w: { var: 'mastW' }, h: 44, r: 22, fill: { prim: 'withAlpha', args: { color: { prim: 'token', args: { name: 'hard' } }, alpha: 0.5 } } } },
      { emit: { k: 'text', x: { '+': [{ var: 'pad' }, 20] }, y: { var: 'mastY' }, lines: [{ var: 'mast' }], size: 20, weight: 'bold', color: '#FFFFFF', track: 4 } },
      { emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'titleTop' }, 76] }, lines: { var: 'titleLines' }, lh: 90, size: 76, weight: 'bold', color: { var: 's.ink' } } },
      { emit: { k: 'fill', x: { var: 'pad' }, y: { '-': [{ var: 'titleTop' }, 26] }, w: 84, h: 8, color: { var: 's.accent' } } },
      { if: { cond: { truthy: { var: 'sumLines' } }, then: [{ emit: { k: 'text', x: { var: 'pad' }, y: { '+': [{ var: 'sumTop' }, 26] }, lines: { var: 'sumLines' }, lh: 40, size: 26, color: { var: 's.sub' } } }] } },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: { var: 's.sub' }, label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },

  // 素宣信笺：竖排右起，标题占两列、摘要接着补列，最左一细列写款识，两枚朱印一枚空、一枚刻字。
  letter: {
    id: 'letter',
    min_version: 1,
    steps: [
      { let: 's', value: { prim: 'scheme', args: { name: 'riso', categoryId: { var: 'note.category_id' } } } },
      { let: 'pad', value: 56 },
      { let: 'qrSize', value: 108 },
      { let: 'slot', value: 60 },
      { let: 'x0', value: { '-': [{ var: 'W' }, 100] } },
      { let: 'slots', value: 7 },
      { let: 'top', value: 176 },
      { let: 'titleStep', value: 66 },
      { let: 'bodyStep', value: 40 },
      { let: 'kickStep', value: 32 },
      // 那块朱地不进口令表：它跟着"印章"这一种画法走，不跟着分类也不跟着主题走，planner 里就是个局部常量。
      { let: 'SEAL', value: '#9E3B2F' },
      { let: 'colH', value: 772 },
      { let: 'gap', value: 44 },

      { let: 'T', value: { prim: 'vertCols', args: { text: { var: 'note.title' }, colH: { var: 'colH' }, step: { var: 'titleStep' }, maxCols: 2, size: 46, bold: true, fam: { prim: 'token', args: { name: 'serif' } } } } },
      { let: 'tN', value: { len: { var: 'T.cols' } } },
      // 摘要能占几列＝总槽数 − 标题那几列 −（有标题就空一个槽），下限 1 列
      { let: 'B', value: { prim: 'vertCols', args: { text: { var: 'note.summary' }, colH: { var: 'colH' }, step: { var: 'bodyStep' }, maxCols: { max: [1, { '-': [{ var: 'slots' }, { var: 'tN' }, { if: [{ truthy: { var: 'tN' } }, 1, 0] }] }] }, size: 26, fam: { prim: 'token', args: { name: 'serif' } } } } },
      // 切到 20 这一档在量款识之前、拼款识那句之外（planner 就是这个顺序），所以单列一步 do
      { do: { prim: 'setFont', args: { size: 20, fam: { prim: 'token', args: { name: 'serif' } } } } },
      { let: 'kicker', value: { slice: [{ prim: 'joinNonEmpty', args: { sep: ' · ', parts: [{ prim: 'blockName' }, { prim: 'noteDate' }] } }, 0, 14] } },
      { let: 'kickAdv', value: { if: [{ truthy: { var: 'kicker' } }, { prim: 'vertAdv', args: { text: { var: 'kicker' }, step: { var: 'kickStep' } } }, 0] } },
      { let: 'signH', value: { max: [84, { prim: 'qrStickerH', args: { size: { var: 'qrSize' } } }] } },
      // 最长的列＝标题那几列的大 与 摘要那几列的大 里取大。数组摊不开进 max，所以套两次 maxOf。
      { let: 'colLen', value: { prim: 'maxOf', args: { values: { var: 'B.advs' }, seed: { prim: 'maxOf', args: { values: { var: 'T.advs' }, seed: 0 } } } } },
      { let: 'height', value: { min: [1360, { '+': [{ var: 'top' }, { max: [{ var: 'colLen' }, { if: [{ truthy: { var: 'kicker' } }, { '+': [{ var: 'kickAdv' }, 26, 44] }, 0] }] }, { var: 'gap' }, { var: 'signH' }, 56] }] } },
      { let: 'signTop', value: { '-': [{ var: 'height' }, 56, { var: 'signH' }] } },

      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: { var: 's.bg' } } },
      // 引首章：只有朱地、不刻字，刻字留给落款那枚，两枚都响就闹了
      { emit: { k: 'rrect', x: { '-': [{ var: 'x0' }, 26] }, y: 52, w: 52, h: 52, r: 6, fill: { var: 'SEAL' } } },
      // 引首章里面那一圈从来没能画出来：planner 传的是 {line, lineWidth}，而 rrect 只读 fill/stroke。
      // 这里按名单能写的写法落一枚"什么都不填什么都不描"的圆角矩形，绘制序列（beginPath+roundRect）
      // 和从前一字不差，所以画面也没变；要不要真给它加一道白细框，是设计的事。
      { emit: { k: 'rrect', x: { '-': [{ var: 'x0' }, 20] }, y: 58, w: 40, h: 40, r: 4 } },
      { if: { cond: { truthy: { var: 'tN' } }, then: [{ emit: { k: 'text', x: { var: 'x0' }, y: { var: 'top' }, lines: { var: 'T.cols' }, vert: true, lh: { var: 'titleStep' }, colGap: { '-': [{ var: 'slot' }, { var: 'titleStep' }] }, size: 46, weight: 'bold', color: { var: 's.ink' }, fam: { prim: 'token', args: { name: 'serif' } }, vpunct: true } }] } },
      { if: { cond: { truthy: { var: 'B.cols' } }, then: [{ emit: { k: 'text', x: { if: [{ truthy: { var: 'tN' } }, { '-': [{ var: 'x0' }, { '*': [{ '+': [{ var: 'tN' }, 1] }, { var: 'slot' }] }] }, { var: 'x0' }] }, y: { var: 'top' }, lines: { var: 'B.cols' }, vert: true, lh: { var: 'bodyStep' }, colGap: { '-': [{ var: 'slot' }, { var: 'bodyStep' }] }, size: 26, color: { prim: 'mix', args: { c1: { var: 's.ink' }, c2: { var: 's.bg' }, w: 0.8 } }, fam: { prim: 'token', args: { name: 'serif' } }, vpunct: true } }] } },
      // 最左那一细列是款识：分类和日期，小字、淡色，读完正文回头才看得见
      { let: 'kickX', value: 120 },
      {
        if: {
          cond: { truthy: { var: 'kicker' } },
          then: [
            { emit: { k: 'text', x: { var: 'kickX' }, y: { var: 'top' }, lines: [{ var: 'kicker' }], vert: true, lh: { var: 'kickStep' }, size: 20, color: { prim: 'withAlpha', args: { color: { var: 's.ink' }, alpha: 0.5 } }, fam: { prim: 'token', args: { name: 'serif' } }, vpunct: true } },
            { let: 'sealY', value: { '+': [{ var: 'top' }, { var: 'kickAdv' }, 26] } },
            { emit: { k: 'rrect', x: { '-': [{ var: 'kickX' }, 22] }, y: { var: 'sealY' }, w: 44, h: 44, r: 5, fill: { var: 'SEAL' } } },
            { do: { prim: 'setFont', args: { size: 24, bold: true, fam: { prim: 'token', args: { name: 'serif' } } } } },
            { emit: { k: 'text', x: { var: 'kickX' }, y: { '+': [{ var: 'sealY' }, 33] }, lines: [{ prim: 'brandGlyph' }], size: 24, weight: 'bold', color: { prim: 'token', args: { name: 'paper' } }, align: 'center', fam: { prim: 'token', args: { name: 'serif' } } } },
          ],
        },
      },
      { let: 'sign', value: { prim: 'signRow', args: { x: { var: 'pad' }, y: { var: 'signTop' }, maxW: { '-': [{ var: 'W' }, { '*': [{ var: 'pad' }, 2] }, { var: 'qrSize' }, 40] }, size: 30, avatarD: 84 } } },
      { emitMany: { var: 'sign.layers' } },
      { let: 'qr', value: { prim: 'qrSticker', args: { x: { '-': [{ var: 'W' }, { var: 'pad' }, { var: 'qrSize' }] }, y: { var: 'signTop' }, size: { var: 'qrSize' }, offset: { var: 's.accent' }, ink: { var: 's.sub' }, label: { prim: 'i18n', args: { key: 'scanToView' } } } } },
      { emitMany: { var: 'qr.layers' } },
    ],
  },
}
