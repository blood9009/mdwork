import { Modal } from './Modal';
import type { AppSettings } from '../settings';

interface SettingsDialogProps {
  settings: AppSettings;
  fonts: string[];
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, fonts, onChange, onClose }: SettingsDialogProps) {
  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <Modal title="编辑器设置" onClose={onClose}>
      <div className="modal-body settings-form">
        <datalist id="system-font-list">
          {fonts.map((font) => <option value={font} key={font} />)}
        </datalist>
        <label>
          <span>编辑器字体</span>
          <input list="system-font-list" value={settings.editorFont}
            onChange={(event) => patch('editorFont', event.target.value)} />
        </label>
        <label>
          <span>预览正文字体</span>
          <input list="system-font-list" value={settings.previewFont}
            onChange={(event) => patch('previewFont', event.target.value)} />
        </label>
        <label>
          <span>代码块字体</span>
          <input list="system-font-list" value={settings.codeFont}
            onChange={(event) => patch('codeFont', event.target.value)} />
        </label>
        <div className="form-row">
          <label>
            <span>编辑器字号</span>
            <input type="number" min="10" max="28" value={settings.editorFontSize}
              onChange={(event) => patch('editorFontSize', Number(event.target.value))} />
          </label>
          <label>
            <span>预览字号</span>
            <input type="number" min="12" max="30" value={settings.previewFontSize}
              onChange={(event) => patch('previewFontSize', Number(event.target.value))} />
          </label>
        </div>
        <div className="font-sample" style={{ fontFamily: settings.previewFont }}>
          中文字体预览 · Markdown · 123
        </div>
        <label className="check-label">
          <input type="checkbox" checked={settings.syncScroll}
            onChange={(event) => patch('syncScroll', event.target.checked)} />
          编辑器滚动时同步预览
        </label>
        <label className="check-label">
          <input type="checkbox" checked={settings.showHiddenCharacters}
            onChange={(event) => patch('showHiddenCharacters', event.target.checked)} />
          显示空格、Tab 等隐藏字符
        </label>
        <label className="check-label">
          <input type="checkbox" checked={settings.autoSave}
            onChange={(event) => patch('autoSave', event.target.checked)} />
          停止输入 1.5 秒后自动保存（已打开的文件）
        </label>
        <p className="form-hint">字体来自操作系统，可输入名称搜索；无需导入字体文件。</p>
      </div>
      <footer className="modal-footer">
        <button className="primary-button" onClick={onClose}>完成</button>
      </footer>
    </Modal>
  );
}
