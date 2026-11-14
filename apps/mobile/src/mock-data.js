// Escenario ficticio conservado del prototipo. No son datos NASA FIRMS.
export const points = [
  { x: 405, y: 310, age: 2, frp: 12.4 }, { x: 429, y: 335, age: 4, frp: 8.1 },
  { x: 390, y: 352, age: 5, frp: 16.2 }, { x: 455, y: 370, age: 7, frp: 5.6 },
  { x: 500, y: 320, age: 10, frp: 10.3 }, { x: 460, y: 415, age: 12, frp: 7.2 },
  { x: 530, y: 390, age: 18, frp: 4.8 }, { x: 370, y: 295, age: 22, frp: 9.5 },
  { x: 340, y: 400, age: 28, frp: 6.1 }, { x: 510, y: 460, age: 35, frp: 3.2 },
  { x: 565, y: 340, age: 40, frp: 11.7 }, { x: 415, y: 450, age: 46, frp: 4.3 },
];
export const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const years = [2020, 2021, 2022, 2023, 2024, 2025];
export const monthlyValue = (year, index) => ((year * 7 + index * 11) % 39) + 1;
