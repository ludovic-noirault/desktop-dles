export const strings = {
  appName: "Desktop Dles",
  nav: { routine: "Routine", settings: "Settings" },
  aside: {
    title: "Today",
    counter: (opened: number, total: number) => `${opened}/${total} opened`,
  },
  routine: {
    next: "Next game",
    done: "Routine done",
    reload: "Reload",
    position: (n: number, total: number) => `${n}/${total}`,
    empty: "No games yet. Add some in Settings.",
    emptyLink: "Settings",
  },
  settings: {
    title: "My games",
    add: "Add",
    namePlaceholder: "Name",
    urlPlaceholder: "https://…",
    shuffle: "Shuffle order on launch",
    invalidUrl: "Use an address that starts with https://",
    moveUp: (name: string) => `Move ${name} up`,
    moveDown: (name: string) => `Move ${name} down`,
    remove: (name: string) => `Delete ${name}`,
  },
  loadError: "Could not load your games.",
} as const;
