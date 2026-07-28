import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";

const processor = remark().use(remarkGfm).use(remarkRehype);

export async function BlogMarkdown({ text }: { text: string }) {
  const tree = processor.parse({ value: text });
  const hast = await processor.run(tree);

  return toJsxRuntime(hast, {
    development: false,
    jsx,
    jsxs,
    Fragment,
    components: {
      h1: (props: ComponentProps<"h2">) => <h2 {...props} />,
    },
  });
}
