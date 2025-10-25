// Debug утилиты
export const DEBUG = false;
export const log = DEBUG ? console.log.bind(console) : () => {};
