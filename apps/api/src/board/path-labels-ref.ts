import { Injectable } from '@nestjs/common';

/** C-501: what labels a card from the files its pull request changes. */
export interface PathLabeller {
  refine(
    projectId: string,
    cardId: string,
    changedPaths: readonly string[] | undefined,
  ): Promise<void>;
}

/**
 * `BoardWork` collects and `BoardLabels` writes labels through `BoardWork`, so
 * `BoardWork` reaches the path labelling through this holder, as the
 * suggester is held by `CardLabelSuggestRef`.
 */
@Injectable()
export class PathLabelsRef {
  private paths: PathLabeller | null = null;

  set(paths: PathLabeller | null): void {
    this.paths = paths;
  }

  /** A no-op until the labelling is set at startup. */
  async refine(
    projectId: string,
    cardId: string,
    changedPaths: readonly string[] | undefined,
  ): Promise<void> {
    await this.paths?.refine(projectId, cardId, changedPaths);
  }
}
