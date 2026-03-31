import { stringify } from 'csv-stringify';
import type { Response } from 'express';

export async function streamCsvResponse(
  res: Response,
  rows: Record<string, unknown>[],
  filename: string,
): Promise<void> {
  if (rows.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end('');
    return;
  }

  const headers = Object.keys(rows[0]!);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stringifier = stringify({ header: true, columns: headers });
  stringifier.pipe(res);

  for (const row of rows) {
    stringifier.write(row);
  }

  await new Promise<void>((resolve, reject) => {
    stringifier.on('finish', resolve);
    stringifier.on('error', reject);
    stringifier.end();
  });
}
