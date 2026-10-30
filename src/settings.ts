export interface AppSettings {
  theme: 'light' | 'dark';
  editorFont: string;
  previewFont: string;
  codeFont: string;
  editorFontSize: number;
  previewFontSize: number;
  syncScroll: boolean;
  autoSave: boolean;
  showHiddenCharacters: boolean;
}

const windows = navigator.userAgent.includes('Windows');

export const defaultSettings: AppSettings = {
  theme: 'light',
  editorFont: windows ? 'Consolas' : 'Menlo',
  previewFont: windows ? 'Microsoft YaHei' : 'PingFang SC',
  codeFont: windows ? 'Consolas' : 'Menlo',
  editorFontSize: 14,
  previewFontSize: 16,
  syncScroll: true,
  autoSave: false,
  showHiddenCharacters: false,
};

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('mdwork.settings') ?? localStorage.getItem('mdreader.settings');
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}
