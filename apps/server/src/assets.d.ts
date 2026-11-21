// Bun's `with { type: "file" }` import yields the file's path.
declare module "*.ttf" {
  const path: string;
  export default path;
}
