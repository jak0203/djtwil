export const OPEN_DRAWER = 'OPEN_DRAWER';
export const CLOSE_DRAWER = 'CLOSE_DRAWER';

export function openDrawer() {
  return {
    type: OPEN_DRAWER,
    payload: {}
  }
}

export function closeDrawer() {
  return {
    type: CLOSE_DRAWER,
    payload: {}
  }
}