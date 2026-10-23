/** What the files table and the detail panel ask of their page; the page does the work (the DAW port, the measure port). */
export type FileActions = {
  onPlayQuietest: (fileId: string) => void;
  onOpenInDaw: (fileId: string) => void;
  onRecheck: () => void;
};
