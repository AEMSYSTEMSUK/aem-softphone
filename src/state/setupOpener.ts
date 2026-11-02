// Lets the Accounts screen open the setup check without threading a prop through the tab shell.
let open: (() => void) | null = null;
export const setupOpener = {
  set(fn: () => void) { open = fn; return () => { if (open === fn) open = null; }; },
  open() { open?.(); },
};
