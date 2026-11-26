export interface Datum {
  label: string;
  value: number;
}

/** A small bar chart in brand colors, with a table for screen readers and anyone who wants the numbers. */
export function Bars({
  title,
  data,
  orientation,
  emptyText = 'Nothing yet. Events you check in at this semester show up here.',
  caption,
  tableHead
}: {
  title: string;
  data: Datum[];
  orientation: 'columns' | 'rows';
  emptyText?: string;
  caption?: string;
  tableHead?: [string, string];
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="panel">
      <h3>{title}</h3>
      {data.length === 0 || data.every(d => d.value === 0) ? (
        <p className="muted small">{emptyText}</p>
      ) : orientation === 'columns' ? (
        <div className="colchart" role="img" aria-label={`${title}: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
          {data.map(d => (
            <div key={d.label} className="col">
              <span className="val">{d.value}</span>
              <span className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
              <span className="lab">{d.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rowchart" role="img" aria-label={`${title}: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
          {data.map(d => (
            <div key={d.label} className="rowbar">
              <span className="lab">{d.label}</span>
              <span className="track">
                <span className="bar" style={{ width: `${(d.value / max) * 100}%` }} />
              </span>
              <span className="val">{d.value}</span>
            </div>
          ))}
        </div>
      )}
      {caption && <p className="small muted">{caption}</p>}
      <details>
        <summary>View as table</summary>
        <table>
          {tableHead && (
            <thead>
              <tr>
                <th>{tableHead[0]}</th>
                <th className="num">{tableHead[1]}</th>
              </tr>
            </thead>
          )}
          <tbody>
            {data.map(d => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
