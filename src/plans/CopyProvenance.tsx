import { useEffect, useState } from 'react';
import { api } from './api';
import type { Kind } from './types';
type Provenance = {
  source_id: string;
  target_id: string;
  at: string;
  author: string;
  source_available: boolean;
};
export function CopyProvenance<K extends Kind | 'missions'>({
  kind,
  id,
  onSource,
}: {
  kind: K;
  id: string;
  onSource: (kind: K, id: string) => void;
}) {
  const [info, setInfo] = useState<Provenance | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setInfo(null);
    setError('');
    void api<Provenance | null>(`/${kind}/${id}/provenance`)
      .then((row) => {
        if (active) setInfo(row);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, id]);
  if (error) return <p className="muted">Traçabilité indisponible : {error}</p>;
  if (!info) return null;
  return (
    <div className="copy-provenance">
      <p>
        Copie créée le {new Date(info.at).toLocaleString('fr-FR')} par {info.author}.{' '}
        {info.source_available ? (
          <a
            href={`#${kind}/${info.source_id}`}
            onClick={(e) => {
              e.preventDefault();
              onSource(kind, info.source_id);
            }}
          >
            Consulter la fiche source
          </a>
        ) : (
          'Source supprimée ou inaccessible.'
        )}
      </p>
      <details>
        <summary>Identifiants de traçabilité</summary>
        <p>
          Source : {info.source_id}
          <br />
          Copie : {info.target_id}
        </p>
      </details>
    </div>
  );
}
