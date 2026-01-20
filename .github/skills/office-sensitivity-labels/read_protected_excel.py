"""
Read Excel files that may be AIP-protected or in legacy formats.

This script tries multiple approaches automatically:
1. Standard pandas read (fastest)
2. COM automation (Windows only, handles protection)

Usage:
    python read_protected_excel.py <filepath> [--max-sheets N] [--sheets "Sheet1,Sheet2"]

Examples:
    python read_protected_excel.py "data.xlsx"
    python read_protected_excel.py "data.xlsx" --max-sheets 3
    python read_protected_excel.py "data.xlsx" --sheets "Summary,Details"
"""

import sys
import os
import argparse
import pandas as pd


def read_with_pandas(filepath):
    """Try to read with pandas (fastest method)."""
    try:
        print("Attempting to read with pandas...")
        excel_file = pd.ExcelFile(filepath)
        
        all_data = {}
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(filepath, sheet_name=sheet_name)
            all_data[sheet_name] = df
        
        print(f"✓ Successfully read {len(all_data)} sheets with pandas")
        return all_data
        
    except Exception as e:
        print(f"✗ Pandas read failed: {e}")
        return None


def read_with_com(filepath, max_sheets=None, sheet_names=None):
    """Read using Excel COM automation (Windows only)."""
    
    if sys.platform != 'win32':
        print("✗ COM automation requires Windows")
        return None
    
    try:
        import win32com.client
    except ImportError:
        print("✗ pywin32 not installed. Install with: pip install pywin32")
        return None
    
    print("Attempting to read with Excel COM automation...")
    
    abs_path = os.path.abspath(filepath)
    excel = None
    workbook = None
    
    try:
        # Start Excel application (invisible)
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        
        # Note: Don't set Calculation property - it can fail on some Excel versions
        # excel.Calculation = -4135  # Can cause: "Unable to set the Calculation property"
        
        # Open workbook - Excel handles AIP decryption automatically
        workbook = excel.Workbooks.Open(abs_path, ReadOnly=True)
        
        # Determine which sheets to read
        total_sheets = workbook.Worksheets.Count
        print(f"Found {total_sheets} sheets")
        
        sheets_to_read = range(1, total_sheets + 1)
        
        if sheet_names:
            # Read specific sheets by name
            sheet_list = [s.strip() for s in sheet_names.split(',')]
            available_names = [workbook.Worksheets(i).Name for i in range(1, total_sheets + 1)]
            sheets_to_read = [i for i in range(1, total_sheets + 1)
                            if workbook.Worksheets(i).Name in sheet_list]
            
            if not sheets_to_read:
                print(f"⚠️  None of the requested sheets found.")
                print(f"   Available sheets: {', '.join(available_names)}")
                return None
                
        elif max_sheets and max_sheets < total_sheets:
            # Limit number of sheets
            sheets_to_read = range(1, max_sheets + 1)
            print(f"Reading first {max_sheets} sheets (--max-sheets={max_sheets})")
        
        # Read data from sheets
        all_data = {}
        for i in sheets_to_read:
            sheet = workbook.Worksheets(i)
            sheet_name = sheet.Name
            
            print(f"  Reading sheet {i}: {sheet_name}")
            
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
                    print(f"    → {len(df)} rows × {len(df.columns)} columns")
        
        print(f"✓ Successfully read {len(all_data)} sheets with COM automation")
        return all_data
        
    except Exception as e:
        print(f"✗ COM automation failed: {e}")
        import traceback
        traceback.print_exc()
        return None
        
    finally:
        # Always clean up COM objects
        try:
            if workbook:
                workbook.Close(SaveChanges=False)
            if excel:
                excel.Quit()
        except:
            pass


def display_summary(data):
    """Display summary of read data."""
    if not data:
        return
    
    print("\n" + "=" * 80)
    print("DATA SUMMARY")
    print("=" * 80)
    
    for sheet_name, df in data.items():
        print(f"\nSheet: {sheet_name}")
        print(f"  Rows: {len(df)}")
        print(f"  Columns: {len(df.columns)}")
        print(f"  Column names: {', '.join(map(str, df.columns[:10]))}")
        if len(df.columns) > 10:
            print(f"    ... and {len(df.columns) - 10} more")
        
        # Show first few rows
        print(f"\n  First 3 rows:")
        print(df.head(3).to_string(max_cols=5))
        if len(df.columns) > 5:
            print(f"    ... and {len(df.columns) - 5} more columns")


def main():
    parser = argparse.ArgumentParser(
        description='Read Excel files including AIP-protected ones',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('filepath', help='Path to Excel file')
    parser.add_argument('--max-sheets', type=int, help='Maximum number of sheets to read')
    parser.add_argument('--sheets', help='Comma-separated list of sheet names to read')
    parser.add_argument('--no-summary', action='store_true', help='Skip displaying data summary')
    
    args = parser.parse_args()
    
    filepath = args.filepath
    
    if not os.path.exists(filepath):
        print(f"❌ File not found: {filepath}")
        sys.exit(1)
    
    print(f"Reading: {filepath}")
    print("=" * 80)
    
    # Try pandas first (fastest)
    data = read_with_pandas(filepath)
    
    # If pandas fails, try COM automation
    if data is None:
        print("\nStandard read failed, trying COM automation...")
        data = read_with_com(filepath, max_sheets=args.max_sheets, sheet_names=args.sheets)
    
    # Display results
    if data:
        if not args.no_summary:
            display_summary(data)
        
        print("\n" + "=" * 80)
        print(f"✓ SUCCESS: Read {len(data)} sheet(s)")
        print("=" * 80)
    else:
        print("\n" + "=" * 80)
        print("❌ FAILED: Could not read file with any method")
        print("\nTroubleshooting steps:")
        print("1. Check if you have permission to access this file")
        print("2. Try opening the file manually in Excel")
        print("3. On Windows, ensure Microsoft Excel is installed")
        print("4. Run: python detect_protection.py <filepath>")
        print("=" * 80)
        sys.exit(1)


if __name__ == '__main__':
    main()
