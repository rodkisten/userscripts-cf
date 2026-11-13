import { For } from "solid-js";
import { categoryTag } from "../domain.ts";
import styles from "../Soundgasm.module.css";
export function Tags(props: { tags: string[]; subreddit: string; bridge: any; category?: boolean }) {
  return (
    <For each={props.tags.filter((tag) => categoryTag(tag) === !!props.category)}>
      {(tag) => (
        <a
          class={`${styles["gws-sg-tag"]} ${props.category ? styles["gws-sg-category"] : ""}`}
          href={props.bridge.searchURL(props.subreddit, tag)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Pesquisar ${tag}${props.subreddit ? ` em r/${props.subreddit}` : " no Reddit"}`}
        >
          <strong>#</strong>
          <span>{tag}</span>
        </a>
      )}
    </For>
  );
}
