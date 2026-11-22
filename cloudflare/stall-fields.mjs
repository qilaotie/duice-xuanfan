export function stallFields(row) {
    if (!row) return row;
    const match = String(row.name || '').trim().match(/^((?:\d+)(?:\s*[-–—一]\s*\d+)?#?)\s*(.+)$/);
    return {...row, slot_number: row.slot_number ?? (match ? match[1].replace(/\s+/g,'') : ''),
        display_name: row.display_name ?? (match ? match[2].trim() : row.name)};
}
