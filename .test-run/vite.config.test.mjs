import { mergeConfig } from 'vite';
import base from '../vite.config.js';

// 测试专用：排除 .test-run/ 避免 vite watcher 与浏览器 userData 锁定冲突
export default mergeConfig(base, {
  server: {
    watch: {
      ignored: ['.test-run/**', 'dist/**', '**/node_modules/**', '**/.git/**'],
    },
  },
});
