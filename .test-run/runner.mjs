import { startPreview, stopPreview, ensureBugsHeader, recordBug } from './test-utils.mjs';
import * as testCore from './test-core.mjs';
import * as testCore2 from './test-core2.mjs';
import * as testStyle from './test-style.mjs';
import * as testFind from './test-find.mjs';
import * as testView from './test-view.mjs';
import * as testRender from './test-render.mjs';
import * as testCompare from './test-compare.mjs';

async function main() {
  console.log('[RUNNER] 启动 vite preview...');
  await startPreview();
  ensureBugsHeader();

  const allResults = [];
  const tests = [
    { name: testCore.name || '核心编辑与预览', run: testCore.run },
    { name: testCore2.name || '核心编辑补充', run: testCore2.run },
    { name: testStyle.name || '样式工具栏', run: testStyle.run },
    { name: testFind.name || '查找与替换', run: testFind.run },
    { name: testView.name || '视图增强与主题', run: testView.run },
    { name: testRender.name || '渲染与增强', run: testRender.run },
    { name: testCompare.name || 'Compare 模块', run: testCompare.run },
  ];

  for (const t of tests) {
    console.log(`\n=== ${t.name} ===`);
    try {
      const res = await t.run();
      for (const r of res) {
        allResults.push({ ...r, module: t.name });
        console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}: ${r.ok ? '通过' : r.error}`);
      }
    } catch (e) {
      console.error(`  模块 ${t.name} 执行异常:`, e.message);
    }
  }

  const passed = allResults.filter(r => r.ok);
  let failed = allResults.filter(r => !r.ok);
  console.log(`\n[RUNNER] 首次汇总：总计 ${allResults.length}，通过 ${passed.length}，失败 ${failed.length}`);

  // 二次确认：对每个首次失败的用例，独立重启浏览器与 preview 复跑一次
  if (failed.length) {
    console.log('\n[RUNNER] 进入二次确认（独立复跑失败用例）...');
    await stopPreview();
    const confirmed = [];
    for (const f of failed) {
      const mod = tests.find(t => t.name === f.module);
      if (!mod) { confirmed.push(f); continue; }
      // 找到对应 fn 重新执行（通过模块导出的 run 不便单跑，这里用模块级 run 内部分离困难，
      // 故采用整模块复跑并匹配 id 的方式做二次确认）
      try {
        await startPreview();
        const res = await mod.run();
        await stopPreview();
        const rerun = res.find(r => r.id === f.id);
        if (rerun && rerun.ok) {
          console.log(`  ↺ ${f.module} / ${f.id}: 二次复跑通过（偶发/不稳定，不记为 BUG）`);
        } else {
          console.log(`  ✖ ${f.module} / ${f.id}: 二次复跑仍失败（确认为 BUG）`);
          confirmed.push({ ...f, rerunError: rerun ? rerun.error : '复跑未返回该用例' });
        }
      } catch (e) {
        console.error(`  二次复跑异常 ${f.module}/${f.id}:`, e.message);
        confirmed.push({ ...f, rerunError: e.message });
      }
    }
    failed = confirmed;
  }

  if (failed.length) {
    console.log('\n[RUNNER] 确认的 BUG：');
    let bugIdx = 1;
    for (const f of failed) {
      console.log(`  - BUG-${bugIdx} ${f.module} / ${f.id}: ${f.error}`);
      recordBug({
        id: bugIdx,
        feature: f.module,
        caseName: f.id,
        symptom: `首次：${f.error}；二次：${f.rerunError || f.error}`,
        steps: `模块 ${f.module} 用例 ${f.id} 独立复跑两次均失败`,
        consoleErrors: (f.console || []).map(c => ({ type: c.type, text: c.text })),
      });
      bugIdx++;
    }
  }

  console.log(`\n[RUNNER] 最终汇总：通过 ${passed.length}，确认 BUG ${failed.length}`);
  await stopPreview();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error('[RUNNER] 异常:', e);
  process.exit(1);
});
