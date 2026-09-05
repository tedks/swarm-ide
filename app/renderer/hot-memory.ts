// This module is outside the replaceable React component. Vite retains its data
// if this module itself changes too; production never retains component state.
export const hotMemory = import.meta.hot?.data as { workbench?: unknown } | undefined;
