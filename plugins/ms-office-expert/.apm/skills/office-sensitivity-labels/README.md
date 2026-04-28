# Office Sensitivity Labels - Python Tools

> **📖 For complete documentation including technical details, see [SKILL.md](SKILL.md)**

This folder contains Python tools for detecting and reading Microsoft Office files that may have Azure Information Protection (AIP) encryption or sensitivity labels.

## Quick Start

### 1. Detect if a file is protected

```bash
python detect_protection.py "data.xlsx"
```

This will analyze the file and tell you:

- File format (OLE2 vs ZIP)
- Whether it appears to be protected
- Recommended reading method

### 2. Read any Excel file (protected or not)

```bash
python read_protected_excel.py "data.xlsx"
```

This automatically tries multiple methods to read the file:

1. Standard pandas (fast)
2. COM automation (if pandas fails)

### 3. Use as a Python module

```python
from excel_reader import read_excel

# Simple usage
data = read_excel('data.xlsx')
for sheet_name, df in data.items():
    print(f"{sheet_name}: {len(df)} rows")

# Advanced usage
data = read_excel(
    'data.xlsx',
    max_sheets=5,  # Limit to first 5 sheets
    sheet_names=['Summary', 'Details']  # Or specific sheets
)
```

## Scripts

### `detect_protection.py`

Analyzes a file to determine if it's protected/encrypted.

**Usage:**

```bash
python detect_protection.py <filepath>
```

**Requirements:**

- `pip install olefile`

### `read_protected_excel.py`

Command-line tool to read Excel files with automatic fallback.

**Usage:**

```bash
# Read all sheets
python read_protected_excel.py "data.xlsx"

# Read first 3 sheets only
python read_protected_excel.py "data.xlsx" --max-sheets 3

# Read specific sheets
python read_protected_excel.py "data.xlsx" --sheets "Summary,Details"

# Skip data summary
python read_protected_excel.py "data.xlsx" --no-summary
```

**Requirements:**

- `pip install pandas openpyxl`
- Windows: `pip install pywin32` (for protected files)

### `excel_reader.py`

Python module with clean API for reading Excel files.

**As a script:**

```bash
python excel_reader.py "data.xlsx"
```

**As a module:**

```python
from excel_reader import read_excel, get_sheet_names

# Get sheet names only
sheets = get_sheet_names('data.xlsx')

# Read all data
data = read_excel('data.xlsx')

# Read with options
data = read_excel('data.xlsx', max_sheets=10, verbose=False)
```

## Installation

### Minimum requirements

```bash
pip install pandas openpyxl
```

### For protected file detection

```bash
pip install olefile
```

### For protected file reading (Windows only)

```bash
pip install pywin32
```

### Install all

```bash
pip install pandas openpyxl olefile pywin32
```

## Common Issues

### "OLE2 compound document" error

This means the file is either:

- Protected with AIP/DRM encryption
- An old Excel format (.xls instead of .xlsx)

**Solution:** Use `read_protected_excel.py` or the COM automation method.

### "Cannot set Calculation property" error

Some Excel versions don't support changing the Calculation property via COM.

**Solution:** The scripts in this folder avoid this issue by not setting that property.

### Unicode encoding errors

Some files contain special characters that can cause encoding issues.

**Solution:** The scripts handle this automatically by setting UTF-8 encoding.

### Excel process won't quit

Sometimes Excel.exe remains in Task Manager after errors.

**Solution:**

- Kill manually: Task Manager → End Task on EXCEL.EXE
- The scripts use proper cleanup in `finally` blocks

## How It Works

### Unprotected files (.xlsx, .xlsm)

- Modern Office files are ZIP archives
- Can be read directly with pandas/openpyxl
- Fast and efficient

### Protected files (AIP/DRM)

- Stored in OLE2 compound document format
- Encrypted content requires authentication
- On Windows, Excel COM automation handles decryption automatically
- Cross-platform solutions require Microsoft Information Protection SDK

### Legacy files (.xls, .doc, .ppt)

- Also use OLE2 format but not encrypted
- Can be read with COM automation
- Or converted to modern format first

## Best Practices

1. **Always detect first**: Use `detect_protection.py` to understand what you're dealing with
2. **Use the module**: Import `excel_reader` for production code
3. **Handle failures gracefully**: Check if `read_excel()` returns `None`
4. **Limit sheets for large files**: Use `max_sheets` to avoid timeouts
5. **Clean up**: The scripts handle cleanup automatically, but kill stuck EXCEL.EXE processes if needed

## Security Considerations

- These tools respect file protection - they don't bypass security
- COM automation uses your Windows credentials
- Only works if you have permission to access the file
- Don't create unprotected copies of sensitive files
- Follow your organization's data handling policies

## See Also

- [SKILL.md](SKILL.md) - Detailed technical documentation
- [Microsoft Information Protection SDK](https://docs.microsoft.com/en-us/information-protection/develop/)
