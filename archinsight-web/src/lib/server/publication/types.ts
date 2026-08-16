export type PlaygroundPublication = {
  slot: string;
  repositoryId: string;
  ownerId: string;
  publishedBy: string;
  publishedAt: string;
  updatedAt: string;
};

export interface PlaygroundPublicationStore {
  current(slot?: string): Promise<PlaygroundPublication | null>;
  publish(slot: string, ownerId: string, repositoryId: string, publishedBy: string): Promise<PlaygroundPublication>;
  unpublish(slot: string): Promise<void>;
}
