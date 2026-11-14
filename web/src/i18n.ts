export const messages = {
  es: {
    search: 'Buscar municipio o estado', coordinates: 'Coordenadas', draw: 'Dibujar área', clearArea: 'Borrar área', cancelDraw: 'Cancelar dibujo', drawnArea: 'Área dibujada', drawingHint: 'Haz clic para añadir vértices; doble clic, clic en el inicio o Intro para terminar.', drawnStatus: 'Área dibujada: {count} vértices',
    range: 'Rango de fechas', activity: 'Calendario de actividad', count: 'Conteo',
    anomaly: 'Anomalía', median: 'Mediana', mean: 'Promedio', daily: 'Desglose diario',
    noData: 'No hay datos para esta área y periodo.', loading: 'Cargando datos…',
  },
  en: {
    search: 'Search municipality or state', coordinates: 'Coordinates', draw: 'Draw area', clearArea: 'Clear area', cancelDraw: 'Cancel drawing', drawnArea: 'Drawn area', drawingHint: 'Click to add vertices; double-click, click the start, or press Enter to finish.', drawnStatus: 'Area drawn: {count} vertices',
    range: 'Date range', activity: 'Activity calendar', count: 'Count',
    anomaly: 'Anomaly', median: 'Median', mean: 'Mean', daily: 'Daily breakdown',
    noData: 'No data for this area and period.', loading: 'Loading data…',
  },
  pt: {
    search: 'Buscar município ou estado', coordinates: 'Coordenadas', draw: 'Desenhar área', clearArea: 'Apagar área', cancelDraw: 'Cancelar desenho', drawnArea: 'Área desenhada', drawingHint: 'Clique para adicionar vértices; clique duas vezes, clique no início ou pressione Enter para terminar.', drawnStatus: 'Área desenhada: {count} vértices',
    range: 'Intervalo de datas', activity: 'Calendário de atividade', count: 'Contagem',
    anomaly: 'Anomalia', median: 'Mediana', mean: 'Média', daily: 'Detalhamento diário',
    noData: 'Sem dados para esta área e período.', loading: 'Carregando dados…',
  },
} as const;

export type Language = keyof typeof messages;
