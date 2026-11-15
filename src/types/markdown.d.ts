/** Markdown files are bundled as their text (see markdownTransformer.js). */
declare module '*.md' {
  const text: string;
  export = text;
}
