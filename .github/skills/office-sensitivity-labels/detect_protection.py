"""
Detect if an Office file (Excel, Word, PowerPoint) has AIP/DRM protection.

Usage:
    python detect_protection.py <filepath>

Example:
    python detect_protection.py "data.xlsx"
"""

import sys
import os


def check_file_header(filepath):
    """Check file format by examining header bytes."""
    try:
        with open(filepath, 'rb') as f:
            header = f.read(8)
        
        header_hex = header.hex()
        
        # OLE2 format: d0cf11e0a1b11ae1 (often indicates protection or legacy format)
        # Standard XLSX: 504b0304 (ZIP file signature)
        # Standard DOCX: 504b0304 (ZIP file signature)
        # Standard PPTX: 504b0304 (ZIP file signature)
        
        if header_hex.startswith('d0cf11e0'):
            return 'OLE2', True  # Likely protected or old format
        elif header_hex.startswith('504b0304'):
            return 'ZIP', False  # Standard modern Office format
        else:
            return 'UNKNOWN', None
            
    except Exception as e:
        return f'ERROR: {e}', None


def check_aip_protection(filepath):
    """
    Check if file has AIP/DRM protection using olefile.
    
    Returns:
        bool: True if protected, False otherwise
    """
    try:
        import olefile
    except ImportError:
        print("⚠️  olefile not installed. Install with: pip install olefile")
        return None
    
    try:
        ole = olefile.OleFileIO(filepath)
        
        # List all streams
        streams = ole.listdir()
        
        # Check for encryption markers
        encrypted_streams = [s for s in streams if any(
            x in str(s).lower() for x in ['encrypt', 'drm', 'rights', 'protection']
        )]
        
        has_protection = bool(encrypted_streams)
        
        if has_protection:
            print("⚠️  FILE IS ENCRYPTED/PROTECTED")
            print("\nEncryption-related streams:")
            for stream in encrypted_streams:
                print(f"  {stream}")
        
        # Check for DataSpaces (another indicator of protection)
        dataspace_streams = [s for s in streams if 'dataspace' in str(s).lower()]
        if dataspace_streams:
            print("\nDataSpaces found (indicates encryption):")
            for stream in dataspace_streams:
                print(f"  {stream}")
            has_protection = True
        
        # Read protection label if present
        if ['\x06DataSpaces', 'TransformInfo', 'LabelInfo'] in streams:
            try:
                label_data = ole.openstream(['\x06DataSpaces', 'TransformInfo', 'LabelInfo']).read()
                readable = ''.join(chr(b) if 32 <= b < 127 else ' ' for b in label_data)
                print(f"\nLabel info: {readable[:200]}")
            except:
                pass
        
        ole.close()
        return has_protection
        
    except Exception as e:
        print(f"Could not analyze with olefile: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python detect_protection.py <filepath>")
        print("\nExample:")
        print('  python detect_protection.py "data.xlsx"')
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    if not os.path.exists(filepath):
        print(f"❌ File not found: {filepath}")
        sys.exit(1)
    
    print(f"Analyzing: {filepath}")
    print("=" * 80)
    
    # Check file header
    format_type, likely_protected = check_file_header(filepath)
    print(f"\nFile Format: {format_type}")
    
    if format_type == 'OLE2':
        print("⚠️  File is in OLE2 format (may be protected or legacy .xls/.doc/.ppt)")
        
        # Deep analysis with olefile
        is_protected = check_aip_protection(filepath)
        
        if is_protected:
            print("\n" + "=" * 80)
            print("✓ RECOMMENDATION: Use COM automation to read this file")
            print("  See: read_protected_excel.py")
        elif is_protected is False:
            print("\n" + "=" * 80)
            print("✓ File appears to be legacy format (.xls, .doc, .ppt)")
            print("  Should be readable with COM automation or conversion")
        
    elif format_type == 'ZIP':
        print("✓ File is in modern Office format (.xlsx, .docx, .pptx)")
        print("  Should be readable with standard libraries (pandas, openpyxl, etc.)")
    
    print("\n" + "=" * 80)


if __name__ == '__main__':
    main()
