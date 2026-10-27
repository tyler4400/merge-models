/// <reference types="vite/client" />

declare module "*.png" {
  const src: string;
  export default src;
}

// 图片经 Vite 导入后是资源 URL，因此声明为字符串，供 TypeScript 检查引用。
declare module "*.webp" {
  const src: string;
  export default src;
}
