import { categoryTag } from "../domain.ts";
import styles from "../Soundgasm.module.css";
export function Tags({ tags, subreddit, bridge, category = false }: {
  tags: string[];
  subreddit: string;
  bridge: { searchURL: (subreddit: string, tag: string) => string };
  category?: boolean;
}) {
  return <>
    {tags.filter((tag) => categoryTag(tag) === category).map((tag) => (
      <a key={tag}
        className={`${styles["gws-sg-tag"]} ${category ? styles["gws-sg-category"] : ""}`}
        href={bridge.searchURL(subreddit, tag)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Pesquisar ${tag}${subreddit ? ` em r/${subreddit}` : " no Reddit"}`}>
        <strong>#</strong><span>{tag}</span>
      </a>
    ))}
  </>;
}
