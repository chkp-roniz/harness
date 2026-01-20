---
name: "office-sensitivity-labels"
description: "Guidelines for handling Microsoft Office files (.xlsx, .xls, .xlsm, .docx, .doc, .docm, .pptx, .ppt, .pptm) including reading, writing, detecting and handling Azure Information Protection (AIP) encrypted/protected files programmatically across different platforms"
---

# Handling Protected and Confidential Files

## Quick Reference

**Problem:** Need to read an Excel/Word/PowerPoint file programmatically, but getting errors?

**Solutions (in order of ease):**

1. **Use the ready-made scripts** (recommended):

   ```bash
   # Detect if file is protected
   python detect_protection.py "data.xlsx"

   # Read any Excel file (auto-detects and uses best method)
   python read_protected_excel.py "data.xlsx"
   ```

2. **Use as a Python module**:

   ```python
   from excel_reader import read_excel
   data = read_excel('data.xlsx')
   ```

3. **Manual workflow**: Open in Excel → Save As → Remove sensitivity label → Read with pandas

**📌 See [Using the Provided Scripts](#using-the-provided-scripts) below for installation, detailed examples, and all features.**

---

## Using the Provided Scripts

This skill includes production-ready Python scripts that handle all edge cases automatically. **Use these scripts instead of writing custom code** to avoid common pitfalls.

### Installation

```bash
# Install from requirements.txt
pip install -r requirements.txt

# Or install manually
pip install pandas openpyxl olefile

# Windows only (for protected files)
pip install pywin32
```

### Script 1: `detect_protection.py` - Analyze Files

Checks if a file is protected before attempting to read it.

```bash
python detect_protection.py "data.xlsx"
```

**Output:**

- File format (OLE2 = possibly protected, ZIP = standard format)
- Encryption markers and DataSpaces
- Recommendation for reading method

**Use when:** You need to diagnose why a file won't read with pandas.

### Script 2: `read_protected_excel.py` - Universal Excel Reader

Command-line tool that automatically tries multiple methods (pandas → COM automation).

```bash
# Read all sheets
python read_protected_excel.py "data.xlsx"

# Read first 3 sheets only (for large files)
python read_protected_excel.py "data.xlsx" --max-sheets 3

# Read specific sheets
python read_protected_excel.py "data.xlsx" --sheets "Summary,Details"

# Skip data preview
python read_protected_excel.py "data.xlsx" --no-summary
```

**Features:**

- ✅ Tries pandas first (fast)
- ✅ Falls back to COM automation (handles protected files)
- ✅ UTF-8 encoding (handles Unicode characters)
- ✅ Avoids "Calculation property" error
- ✅ Proper cleanup (no stuck Excel processes)

**Use when:** You need to read any Excel file from command line.

### Script 3: `excel_reader.py` - Python Module

Clean API for integration into your Python code.

```python
from excel_reader import read_excel, get_sheet_names

# Simple usage
data = read_excel('data.xlsx')
if data:
    for sheet_name, df in data.items():
        print(f"{sheet_name}: {len(df)} rows × {len(df.columns)} columns")

# Advanced usage
data = read_excel(
    filepath='data.xlsx',
    max_sheets=5,              # Limit sheets
    sheet_names=['Summary'],   # Specific sheets
    verbose=False              # Quiet mode
)

# Get sheet names without reading data
sheets = get_sheet_names('data.xlsx')
print(f"Available sheets: {sheets}")
```

**Features:**

- ✅ Automatic method selection
- ✅ Returns `None` on failure (easy error handling)
- ✅ UTF-8 encoding built-in
- ✅ Can be imported as a module

**Use when:** You're writing Python code that needs to read Excel files.

### Common Issues Solved by Scripts

| Issue                             | How Scripts Handle It                |
| --------------------------------- | ------------------------------------ |
| "OLE2 compound document" error    | Auto-detects and uses COM automation |
| "Cannot set Calculation property" | Skips that property entirely         |
| Unicode encoding errors           | UTF-8 wrapper included               |
| Stuck Excel processes             | Proper cleanup in `finally` blocks   |
| Timeouts on large files           | `--max-sheets` parameter             |
| Files with special characters     | UTF-8 handling throughout            |

### When to Use Each Script

```
┌─────────────────────────────────────────┐
│ Need to diagnose a file?                │
│ → python detect_protection.py "file"    │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Command-line reading?                   │
│ → python read_protected_excel.py "file" │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Integration in Python code?             │
│ → from excel_reader import read_excel   │
└─────────────────────────────────────────┘
```

---

## Overview

Modern enterprises often protect sensitive documents using encryption and Digital Rights Management (DRM). This guide explains how to identify protected files and work with them programmatically while maintaining security compliance.

## Common Protection Methods

### Microsoft Azure Information Protection (AIP)

- Applied to Office documents (Excel, Word, PowerPoint)
- Uses DRM encryption with sensitivity labels
- Requires authentication to decrypt
- Protection persists even when files are moved or copied

### Characteristics of Protected Files

- File extension may appear normal (`.xlsx`, `.docx`)
- Actually stored in OLE2 compound format with encrypted streams
- Contains metadata about protection policy and label
- Requires proper permissions to access content

---

## Detecting File Protection

### Identifying Protected Office Documents

Protected files contain specific OLE streams that indicate encryption. Here's how to detect them:

```python
import olefile

def check_aip_protection(filepath):
    """Check if file has AIP/DRM protection and extract metadata"""
    try:
        ole = olefile.OleFileIO(filepath)

        # List all streams
        streams = ole.listdir()

        # Check for encryption markers
        encrypted_streams = [s for s in streams if any(
            x in str(s).lower() for x in ['encrypt', 'drm', 'rights', 'protection']
        )]

        if encrypted_streams:
            print("⚠️  FILE IS ENCRYPTED/PROTECTED")
            print("\nEncryption-related streams:")
            for stream in encrypted_streams:
                print(f"  {stream}")

        # Read protection label if present
        if ['\x06DataSpaces', 'TransformInfo', 'LabelInfo'] in streams:
            label_data = ole.openstream(['\x06DataSpaces', 'TransformInfo', 'LabelInfo']).read()
            readable = ''.join(chr(b) if 32 <= b < 127 else ' ' for b in label_data)
            print(f"Label info: {readable[:200]}")

        ole.close()
        return bool(encrypted_streams)

    except Exception as e:
        print(f"Error: {e}")
        return False
```

**Requirements:**

- `pip install olefile`
- Works on: **All platforms** (Windows, macOS, Linux)

### File Header Analysis

You can also check the file format by examining its header:

```python
with open('protected_file.xlsx', 'rb') as f:
    header = f.read(8)

# OLE2 format (often indicates protection): d0cf11e0a1b11ae1
# Standard XLSX format: 504b0304 (ZIP file signature)
print('File header (hex):', header.hex())
```

---

## Solutions for Accessing Protected Files

**Quick Start:** This folder includes ready-to-use Python scripts:

- `detect_protection.py` - Check if a file is protected
- `read_protected_excel.py` - Read any Excel file (tries multiple methods)
- `excel_reader.py` - Python module with clean API
- See [README.md](README.md) for usage examples

### 1. Office COM Automation (Windows Only)

**Platform:** Windows only  
**Requires:** Microsoft Office installed

This method leverages the installed Office application to handle decryption automatically if you have proper permissions.

**Important - Unicode Handling:**
When reading files with special characters, you may encounter encoding errors. Add this at the start of your script:

```python
import sys
import io

# Handle Unicode output properly
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
```

```python
import win32com.client
import pandas as pd
import os

def read_protected_excel_via_com(filepath, max_sheets=None, sheet_names=None):
    """Read AIP-protected Excel file using Excel COM automation

    Args:
        filepath: Path to the Excel file
        max_sheets: Maximum number of sheets to read (None = all sheets)
        sheet_names: List of specific sheet names to read (None = all sheets)

    Returns:
        Dictionary of DataFrames, one per sheet
    """
    abs_path = os.path.abspath(filepath)
    excel = None
    workbook = None

    try:
        # Start Excel application (invisible)
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False

        # Performance optimizations (optional - may fail on some Excel versions)
        # Note: Setting Calculation property can cause errors on some systems
        # excel.Calculation = -4135  # xlCalculationManual - SKIP THIS
        try:
            excel.ScreenUpdating = False
            excel.EnableEvents = False
        except:
            pass  # Some Excel versions don't support these properties

        # Open workbook - Excel handles AIP decryption
        workbook = excel.Workbooks.Open(abs_path, ReadOnly=True)

        # Determine which sheets to read
        total_sheets = workbook.Worksheets.Count
        sheets_to_read = range(1, total_sheets + 1)

        if sheet_names:
            # Read specific sheets by name
            sheets_to_read = [i for i in sheets_to_read
                            if workbook.Worksheets(i).Name in sheet_names]
        elif max_sheets:
            # Limit number of sheets
            sheets_to_read = range(1, min(max_sheets + 1, total_sheets + 1))

        # Read data from sheets
        all_data = {}
        for i in sheets_to_read:
            sheet = workbook.Worksheets(i)
            sheet_name = sheet.Name

            # Get all data at once
            used_range = sheet.UsedRange
            data = used_range.Value

            if data:
                # Convert to pandas DataFrame
                df = pd.DataFrame(data)
                if len(df) > 0:
                    # Use first row as headers
                    df.columns = df.iloc[0]
                    df = df[1:].reset_index(drop=True)
                    all_data[sheet_name] = df

        return all_data

    finally:
        # Always clean up COM objects
        try:
            if workbook:
                workbook.Close(SaveChanges=False)
            if excel:
                # Restore settings (if they were changed)
                try:
                    excel.ScreenUpdating = True
                    excel.EnableEvents = True
                except:
                    pass
                excel.Quit()
        except Exception as cleanup_error:
            # If cleanup fails, Excel process may remain - kill manually if needed
            pass
```

**Requirements:**

- `pip install pywin32`
- Microsoft Excel installed
- User authenticated with appropriate permissions

**Pros:**

- Handles decryption automatically
- Works with any Office-supported format
- Respects existing security policies

**Cons:**

- Windows-only solution
- Requires Office installation
- Slower than direct file reading (can be 10-100x slower)
- Excel process management needed
- May timeout with very large files or many sheets
- Should use Python files rather than terminal one-liners

**Performance Tips:**

- Disable screen updating: `excel.ScreenUpdating = False`
- Set calculation to manual: `excel.Calculation = -4135`
- Disable events: `excel.EnableEvents = False`
- Open as read-only: `workbook = excel.Workbooks.Open(path, ReadOnly=True)`
- Read specific sheets only rather than all sheets
- Consider reading in batches for files with many sheets

---

### 2. Microsoft Information Protection SDK

**Platform:** All platforms (Windows, macOS, Linux)  
**Requires:** Azure AD authentication

Use the official MIP SDK for cross-platform support:

```python
from azure.identity import DefaultAzureCredential
# Note: MIP SDK requires additional setup and configuration

# This is conceptual - full implementation requires:
# 1. Azure AD app registration
# 2. Proper SDK initialization
# 3. Authentication flow
# 4. File decryption API calls
```

**Requirements:**

- Azure AD tenant and app registration
- Proper permissions assigned
- User authentication to Azure AD

**Pros:**

- Cross-platform support
- Official Microsoft solution
- Respects all DRM policies

**Cons:**

- Complex setup required
- Requires organizational Azure AD
- May need IT/admin support

---

### 3. Manual Decryption Workflow

**Platform:** All platforms (wherever Office runs)

For one-time or occasional access:

1. **Open file in Office application**
   - Double-click the file or open through Excel/Word
   - Authentication happens automatically if you have permissions

2. **Save unprotected copy**
   - File → Save As
   - Choose location outside protected folders
   - Use "Remove sensitivity label" option if available

3. **Read with standard libraries**

   ```python
   import pandas as pd

   # Now read the unprotected copy
   df = pd.read_excel('unprotected_copy.xlsx')
   ```

**Important:** Only create unprotected copies if:

- You have permission to do so
- The copy is stored securely
- You follow organizational data handling policies

---

### 4. Request Access or Unprotected Versions

**Platform:** N/A (Process-based)

Sometimes the best solution is organizational:

- **Contact Data Owner:** Request unprotected version for your specific use case
- **Request Permission Grant:** Ask IT to grant your account decryption rights
- **Explain Business Need:** Provide justification for programmatic access
- **Alternative Data Delivery:** Discuss CSV exports or database access instead

---

## Best Practices

### Security Compliance

1. **Respect Protection Intent**
   - Protection is applied for a reason
   - Don't circumvent security measures
   - Follow organizational policies

2. **Proper Authentication**
   - Always authenticate as yourself
   - Never share credentials or tokens
   - Use service principals for automation

3. **Secure Storage**
   - Don't create unprotected copies unnecessarily
   - Store decrypted data securely
   - Clean up temporary files

### Implementation Guidelines

1. **Check Before Processing**

   ```python
   # Always verify protection status first
   is_protected = check_aip_protection(filepath)
   if is_protected:
       print("File requires special handling")
   ```

2. **Error Handling**

   ```python
   try:
       data = read_protected_file(filepath)
   except PermissionError:
       print("You don't have access to this file")
   except Exception as e:
       print(f"Unable to read file: {e}")
   ```

3. **Resource Cleanup**
   - Always close COM objects (Windows)
   - Release file handles properly
   - Clean up temporary data

### Choosing the Right Approach

| Scenario                        | Recommended Solution   | Platform      |
| ------------------------------- | ---------------------- | ------------- |
| Windows environment with Office | COM Automation         | Windows only  |
| Cross-platform enterprise app   | MIP SDK                | All platforms |
| One-time data extraction        | Manual workflow        | All platforms |
| Lack of technical permissions   | Request access         | N/A           |
| Development/testing             | Unprotected test files | All platforms |

---

## Example: Complete Workflow

Here's a complete example that detects protection and handles appropriately:

```python
import os
import sys
import pandas as pd
import win32com.client

def process_confidential_file(filepath, max_sheets=5):
    """
    Process a potentially protected file with proper handling

    Args:
        filepath: Path to Excel file
        max_sheets: Maximum sheets to read (prevents timeouts on large files)

    Returns:
        Dictionary of DataFrames or None
    """
    # Step 1: Check if file is protected
    print(f"Checking: {filepath}")

    # Try standard read first (fastest if file isn't protected)
    try:
        df = pd.read_excel(filepath)
        print("✓ File read successfully with pandas")
        return {'Sheet1': df}
    except Exception as e:
        print(f"Standard read failed: {e}")
        print("File may be protected, trying COM automation...")

    # Step 2: Handle protected file
    if sys.platform != 'win32':
        print("""
        This file requires special handling. Options:
        1. Open in Office app and save unprotected copy
        2. Use MIP SDK (requires setup)
        3. Request unprotected version from data owner
        """)
        return None

    # Windows: Use COM automation with safety limits
    return read_protected_excel_via_com(filepath, max_sheets=max_sheets)

# Usage - always create as a .py file, not terminal one-liner
if __name__ == "__main__":
    data = process_confidential_file('sensitive_data.xlsx', max_sheets=3)
    if data:
        print(f"\n✓ Successfully read {len(data)} sheets!")
        for sheet_name, df in data.items():
            print(f"  • {sheet_name}: {len(df)} rows × {len(df.columns)} columns")
```

### Example: Reading Large Protected Files Efficiently

```python
def read_large_protected_file(filepath):
    """Read large protected Excel files in batches to avoid timeouts"""
    excel = None
    workbook = None

    try:
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False
        excel.Calculation = -4135  # Manual

        workbook = excel.Workbooks.Open(os.path.abspath(filepath), ReadOnly=True)
        total_sheets = workbook.Worksheets.Count

        print(f"File has {total_sheets} sheets")
        print("Reading first 3 sheets as preview...")

        # Read in small batches
        batch_size = 3
        all_data = {}

        for i in range(1, min(batch_size + 1, total_sheets + 1)):
            sheet = workbook.Worksheets(i)
            print(f"  Reading sheet {i}/{total_sheets}: {sheet.Name}")

            data = sheet.UsedRange.Value
            if data:
                df = pd.DataFrame(data)
                if len(df) > 0:
                    df.columns = df.iloc[0]
                    df = df[1:].reset_index(drop=True)
                    all_data[sheet.Name] = df

        return all_data, total_sheets

    finally:
        if workbook:
            workbook.Close(SaveChanges=False)
        if excel:
            excel.Quit()

# Usage
data, total = read_large_protected_file('large_file.xlsx')
print(f"\nRead {len(data)}/{total} sheets (preview mode)")
```

---

## Troubleshooting

### "Cannot open file" errors or timeouts

**Immediate fixes:**

1. Use the provided `read_protected_excel.py` script instead of custom code
2. Kill stuck Excel processes: Task Manager → End Task on `EXCEL.EXE`
3. Try opening file manually in Excel first to verify permissions

**For large files (many sheets or rows):**

```python
# Use max_sheets to limit reading
python read_protected_excel.py "large_file.xlsx" --max-sheets 5

# Or read specific sheets only
python read_protected_excel.py "file.xlsx" --sheets "Summary,Dashboard"
```

**Common mistakes to avoid:**

- ❌ Don't set `excel.Calculation` property (causes errors on some Excel versions)
- ❌ Don't use terminal one-liners (quoting/escaping issues)
- ✅ Use .py files for proper error handling and cleanup
- ✅ Use the provided scripts which handle all edge cases

### Permission denied

- Contact file owner or IT department
- Request access to the sensitivity label
- Provide business justification for access

### Unicode/Encoding errors

**Symptom:** `UnicodeEncodeError: 'charmap' codec can't encode character`

**Solution:** Add UTF-8 encoding at the start of your script:

```python
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
```

This is already included in the provided scripts (`read_protected_excel.py`, `excel_reader.py`).

### Encoding errors with olefile

- File may have non-ASCII characters in stream names
- Add encoding handling: `str(s).encode('utf-8', errors='ignore').decode('utf-8')`
- This is just for detection; use COM automation for actual reading

### "Unable to set the Calculation property" error

**Symptom:** `pywintypes.com_error: Unable to set the Calculation property of the Application class`

**Cause:** Some Excel versions don't support changing the Calculation property via COM.

**Solution:** Don't set the Calculation property. The provided scripts avoid this issue.

```python
# ❌ This causes errors on some systems:
excel.Calculation = -4135

# ✅ Skip it entirely - the performance difference is minimal for most use cases
```

### COM automation fails

- Check Excel is installed and licensed
- Try opening file manually in Excel first
- Verify no Excel processes are stuck (Task Manager → kill EXCEL.EXE)
- Use the provided scripts which have proper error handling

### Permission denied

- Contact file owner or IT department
- Request access to the sensitivity label
- Provide business justification for access

---

## Summary

Working with protected files requires understanding their protection mechanism and using appropriate tools. Always:

1. ✅ Detect protection status before processing
2. ✅ Use platform-appropriate solutions
3. ✅ Maintain security compliance
4. ✅ Handle errors gracefully
5. ✅ Clean up resources properly

Remember: File protection exists to safeguard sensitive information. Always work within your organization's security policies and respect data handling guidelines.
