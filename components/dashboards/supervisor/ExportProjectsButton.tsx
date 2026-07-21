import { Download, Loader2 } from 'lucide-react';

import { Button } from '../../ui/SharedUI';

type ExportProjectsButtonProps = {
  isExporting: boolean;
  label: string;
  onExport: () => void;
};

export function ExportProjectsButton({ isExporting, label, onExport }: ExportProjectsButtonProps) {
  return (
    <Button variant="outline" onClick={onExport} disabled={isExporting}>
      {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
      {isExporting ? 'Exporting...' : label}
    </Button>
  );
}
