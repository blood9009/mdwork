import { useState } from 'react';
import { Modal } from './Modal';
import type { ResourceInsert, ResourceInsertMode } from '../markdown/resourceSyntax';

interface InsertUrlDialogProps {
  onInsert: (resource: ResourceInsert) => void;
  onClose: () => void;
}

export function InsertUrlDialog({ onInsert, onClose }: InsertUrlDialogProps) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<ResourceInsertMode>('image');
  const [error, setError] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(url.trim());
      const protocols = mode === 'image' ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
      if (!protocols.includes(parsed.protocol)) {
        throw new Error(mode === 'image' ? '图片仅支持 HTTP 或 HTTPS URL。' : '链接仅支持 HTTP、HTTPS 或 Mailto。');
      }
      onInsert({ url: parsed.toString(), label: label.trim(), mode });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '请输入有效的 URL。');
    }
  }

  return (
    <Modal title="插入 URL" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body settings-form">
          <label><span>URL 地址</span><input type="text" value={url} autoFocus required
            placeholder="https://example.com/image.png"
            onChange={(event) => { setUrl(event.target.value); setError(''); }} /></label>
          <label><span>{mode === 'image' ? '图片说明' : '链接文字'}</span><input type="text" value={label}
            placeholder={mode === 'image' ? '图片' : '默认显示 URL'}
            onChange={(event) => setLabel(event.target.value)} /></label>
          <fieldset className="resource-mode">
            <legend>插入方式</legend>
            <label className="check-label"><input type="radio" name="resource-mode" value="image"
              checked={mode === 'image'} onChange={() => { setMode('image'); setError(''); }} />嵌入显示图片</label>
            <label className="check-label"><input type="radio" name="resource-mode" value="link"
              checked={mode === 'link'} onChange={() => { setMode('link'); setError(''); }} />仅插入链接，点击后跳转</label>
          </fieldset>
          <p className="form-hint">HTTP/HTTPS 链接会在系统浏览器中打开；嵌入图片也可导出到 PDF。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button">插入</button>
        </footer>
      </form>
    </Modal>
  );
}
