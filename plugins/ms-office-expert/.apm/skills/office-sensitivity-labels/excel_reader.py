"""
Universal Excel reader module for both protected and unprotected files.

This module provides a simple API that handles all the complexity:
- Automatically detects protection
- Tries multiple reading methods
- Handles Unicode encoding issues
- Provides clean error messages

Usage as a module:
    from excel_reader import read_excel
    
    data = read_excel('data.xlsx')
    for sheet_name, df in data.items():
        print(f"{sheet_name}: {len(df)} rows")

Usage as a script:
    python excel_reader.py <filepath>
"""

import sys
import os
import io
import pandas as pd


def read_excel(filepath, max_sheets=None, sheet_names=None, verbose=True):
    """
    Read Excel file using the best available method.
    
    Args:
        filepath: Path to Excel file
        max_sheets: Maximum number of sheets to read (None = all)
        sheet_names: List of specific sheet names to read (None = all)
        verbose: Print progress messages
    
    Returns:
        dict: Dictionary mapping sheet names to pandas DataFrames
        None: If reading fails
    
    Example:
        data = read_excel('data.xlsx')
        if data:
            summary_df = data['Summary']
            print(summary_df.head())
    """
    
    # Ensure UTF-8 output for Unicode handling
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if verbose:
        print(f"Reading: {filepath}")
    
    # Method 1: Try pandas (fastest, works for unprotected files)
    try:
        if verbose:
            print("  Method 1: pandas...")
        
        excel_file = pd.ExcelFile(filepath)
        all_data = {}
        
        sheets_to_read = excel_file.sheet_names
        if sheet_names:
            sheets_to_read = [s for s in sheets_to_read if s in sheet_names]
        elif max_sheets:
            sheets_to_read = sheets_to_read[:max_sheets]
        
        for sheet_name in sheets_to_read:
            df = pd.read_excel(filepath, sheet_name=sheet_name)
            all_data[sheet_name] = df
        
        if verbose:
            print(f"  ✓ Read {len(all_data)} sheets with pandas")
        return all_data
        
    except Exception as e:
        if verbose:
            print(f"  ✗ pandas failed: {str(e)[:100]}")
    
    # Method 2: Try COM automation (Windows only, handles protected files)
    if sys.platform == 'win32':
        try:
            if verbose:
                print("  Method 2: Excel COM automation...")
            
            result = _read_with_com(filepath, max_sheets, sheet_names, verbose)
            if result:
                return result
                
        except Exception as e:
            if verbose:
                print(f"  ✗ COM automation failed: {str(e)[:100]}")
    else:
        if verbose:
            print("  ✗ COM automation not available (Windows only)")
    
    # All methods failed
    if verbose:
        print("  ❌ All methods failed")
    return None


def _read_with_com(filepath, max_sheets=None, sheet_names=None, verbose=True):
    """Internal function to read with COM automation."""
    
    try:
        import win32com.client
    except ImportError:
        if verbose:
            print("  ✗ pywin32 not installed")
        return None
    
    abs_path = os.path.abspath(filepath)
    excel = None
    workbook = None
    
    try:
        # Start Excel (invisible)
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        
        # Open workbook
        workbook = excel.Workbooks.Open(abs_path, ReadOnly=True)
        total_sheets = workbook.Worksheets.Count
        
        # Determine sheets to read
        sheets_to_read = range(1, total_sheets + 1)
        
        if sheet_names:
            available = {workbook.Worksheets(i).Name: i for i in range(1, total_sheets + 1)}
            sheets_to_read = [available[name] for name in sheet_names if name in available]
        elif max_sheets and max_sheets < total_sheets:
            sheets_to_read = range(1, max_sheets + 1)
        
        # Read sheets
        all_data = {}
        for i in sheets_to_read:
            sheet = workbook.Worksheets(i)
            sheet_name = sheet.Name
            
            data = sheet.UsedRange.Value
            if data:
                df = pd.DataFrame(data)
                if len(df) > 0:
                    df.columns = df.iloc[0]
                    df = df[1:].reset_index(drop=True)
                    all_data[sheet_name] = df
        
        if verbose:
            print(f"  ✓ Read {len(all_data)} sheets with COM automation")
        
        return all_data
        
    finally:
        # Cleanup
        try:
            if workbook:
                workbook.Close(SaveChanges=False)
            if excel:
                excel.Quit()
        except:
            pass


def get_sheet_names(filepath):
    """
    Get list of sheet names without reading all data.
    
    Args:
        filepath: Path to Excel file
    
    Returns:
        list: Sheet names, or None if failed
    """
    try:
        excel_file = pd.ExcelFile(filepath)
        return excel_file.sheet_names
    except:
        pass
    
    if sys.platform == 'win32':
        try:
            import win32com.client
            excel = win32com.client.Dispatch("Excel.Application")
            excel.Visible = False
            excel.DisplayAlerts = False
            workbook = excel.Workbooks.Open(os.path.abspath(filepath), ReadOnly=True)
            
            names = [workbook.Worksheets(i).Name for i in range(1, workbook.Worksheets.Count + 1)]
            
            workbook.Close(SaveChanges=False)
            excel.Quit()
            
            return names
        except:
            pass
    
    return None


def main():
    """Command-line interface."""
    if len(sys.argv) < 2:
        print("Usage: python excel_reader.py <filepath>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)
    
    data = read_excel(filepath, verbose=True)
    
    if data:
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        for sheet_name, df in data.items():
            print(f"\n{sheet_name}: {len(df)} rows × {len(df.columns)} columns")
            print(f"Columns: {', '.join(map(str, df.columns[:5]))}")
            if len(df.columns) > 5:
                print(f"  ... and {len(df.columns) - 5} more")
        print("\n" + "=" * 80)
    else:
        print("\nFailed to read file")
        sys.exit(1)


if __name__ == '__main__':
    main()
