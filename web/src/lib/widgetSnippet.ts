export interface WidgetConfig { lat:number;lon:number;radius:number;theme:'light'|'dark';lang:'es'|'en'|'pt' }
export function widgetSnippet(origin:string,c:WidgetConfig,api?:string):string {return `<script src="${origin}/widget.js"></script>\n<firely-calendar lat="${c.lat}" lon="${c.lon}" radius-km="${c.radius}" theme="${c.theme}" lang="${c.lang}"${api?` api="${api}"`:""}></firely-calendar>`;}
