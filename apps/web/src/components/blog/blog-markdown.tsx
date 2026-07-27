import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Children, type ComponentProps, type ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";

const processor = remark().use(remarkGfm).use(remarkRehype);

function CodeBlock(props: ComponentProps<"pre">) {
  const code = Children.only(props.children) as ReactElement;
  const codeProps = code.props as ComponentProps<"code">;
  const content = codeProps.children;
  if (typeof content !== "string") return null;

  const lang =
    codeProps.className
      ?.split(" ")
      .find((value) => value.startsWith("language-"))
      ?.slice("language-".length) ?? "text";

  return <DynamicCodeBlock lang={lang === "mdx" ? "md" : lang} code={content.trimEnd()} />;
}

export async function BlogMarkdown({ text }: { text: string }) {
  const tree = processor.parse({ value: text });
  const hast = await processor.run(tree);

  return toJsxRuntime(hast, {
    development: false,
    jsx,
    jsxs,
    Fragment,
    components: {
      ...defaultMdxComponents,
      h1: (props: ComponentProps<"h2">) => <h2 {...props} />,
      pre: CodeBlock,
    },
  });
}
