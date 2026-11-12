import { Table } from '@mantine/core';
import type { ReactNode } from 'react';

/** Two-column label/value table for reporting measurements. */
export const StatList = ({ rows }: { rows: [label: string, value: ReactNode][] }) => (
  <Table withRowBorders={false} verticalSpacing={4} horizontalSpacing="sm" fz="sm">
    <Table.Tbody>
      {rows.map(([label, value]) => (
        <Table.Tr key={label}>
          <Table.Th c="dimmed" fw={400} w="1%" style={{ whiteSpace: 'nowrap' }}>{label}</Table.Th>
          <Table.Td ff="monospace" style={{ wordBreak: 'break-word' }}>{value}</Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);
