export type DiagramNotice = {
  readonly kind: 'empty' | 'waiting' | 'unavailable';
  readonly title: string;
  readonly detail: string;
};
