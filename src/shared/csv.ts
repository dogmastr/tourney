/**
 * CSV Utilities
 * 
 * Shared functions for CSV import/export across the application.
 */

/**
 * Export data to a CSV file and trigger download.
 * 
 * @param columns - Column header names
 * @param rows - Array of row data (each row is array of cell values)
 * @param filename - Download filename (without extension)
 */
export function exportToCSV(columns: string[], rows: string[][], filename: string): void {
    const csvContent = [
        columns.join(','),
        ...rows.map(row =>
            row.map(cell => {
                // Escape quotes and wrap in quotes if contains special chars
                const escaped = String(cell).replace(/"/g, '""');
                return /[,"\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into rows and columns.
 * Handles quoted fields and escaped quotes.
 * 
 * @param text - Raw CSV text
 * @returns Array of rows, each row is array of cell values
 */
export function parseCSV(text: string): string[][] {
    const lines = text.split('\n').filter(line => line.trim());
    const result: string[][] = [];

    for (const line of lines) {
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current.trim());
        result.push(parts);
    }

    return result;
}

/**
 * Generate a safe filename from a string (remove special chars).
 * 
 * @param name - Original name
 * @returns Safe filename string
 */
export function toSafeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}
