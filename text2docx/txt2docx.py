#!/usr/bin/env python3
import os
import sys
import re

try:
    import pypandoc
    import docx
    from docx.shared import Mm, Pt, RGBColor
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.enum.text import WD_BREAK
except ImportError:
    print("Missing required libraries. Please install them by running:")
    print("pip install pypandoc docx python-docx")
    sys.exit(1)

def set_page_borders_and_margins(doc):
    for sec in doc.sections:
        # Set page size to A4
        sec.page_width = Mm(210)
        sec.page_height = Mm(297)

        # To place the borders exactly at 20mm, 10mm, 10mm, 10mm from the page edge
        # and leave a 5mm gap between the border and the text:
        # We set the text margins to 25mm, 15mm, 15mm, 15mm
        # And set the border to be offset from the text by 14 points (approx 4.93mm)
        sec.left_margin = Mm(25)
        sec.right_margin = Mm(15)
        sec.top_margin = Mm(15)
        sec.bottom_margin = Mm(15)

        sectPr = sec._sectPr
        
        # Check if pgBorders already exists
        pgBorders = sectPr.find(qn('w:pgBorders'))
        if pgBorders is None:
            pgBorders = OxmlElement('w:pgBorders')
            sectPr.append(pgBorders)
        
        # Clear existing borders if any
        for child in list(pgBorders):
            pgBorders.remove(child)

        # Draw the borders offset from the text
        pgBorders.set(qn('w:offsetFrom'), 'text')

        # Add top, left, bottom, right borders
        for border_name in ['top', 'left', 'bottom', 'right']:
            border = OxmlElement(f'w:{border_name}')
            border.set(qn('w:val'), 'single')
            border.set(qn('w:sz'), '4') # 4 eighths of a point = 0.5 pt thick
            border.set(qn('w:space'), '14') # 14 points spacing from text (approx 5mm)
            border.set(qn('w:color'), '000000') # Black color
            pgBorders.append(border)

def apply_formatting(doc):
    for para in doc.paragraphs:
        
        # Handle the page break placeholder which might be mixed in the paragraph
        for i, run in enumerate(para.runs):
            if 'PAGE_BREAK_PLACEHOLDER' in run.text:
                run.text = run.text.replace('PAGE_BREAK_PLACEHOLDER', '')
                run.add_break(WD_BREAK.PAGE)
        
        para.paragraph_format.line_spacing = 1.5
        is_heading = para.style.name.startswith('Heading')
        is_h1 = para.style.name == 'Heading 1'
        
        for run in para.runs:
            run.font.name = 'Times New Roman'
            rPr = run.element.get_or_add_rPr()
            rFonts = rPr.get_or_add_rFonts()
            rFonts.set(qn('w:ascii'), 'Times New Roman')
            rFonts.set(qn('w:hAnsi'), 'Times New Roman')
            rFonts.set(qn('w:cs'), 'Times New Roman')
            
            if is_heading:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0, 0, 0)
                if is_h1:
                    run.font.size = Pt(14)
                else:
                    run.font.size = Pt(12)
            else:
                run.font.size = Pt(12)

def convert_txt_to_docx(input_file, output_file):
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)

    print("Checking pandoc installation...")
    try:
        pypandoc.get_pandoc_version()
    except OSError:
        print("Pandoc not found. Downloading pandoc...")
        pypandoc.download_pandoc()

    print(f"Converting {input_file} to intermediate docx...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        text_content = f.read()
    
    text_content = re.sub(r'^---\s*$', 'PAGE_BREAK_PLACEHOLDER', text_content, flags=re.MULTILINE)
    
    temp_input = "temp_input_for_pandoc.txt"
    with open(temp_input, 'w', encoding='utf-8') as f:
        f.write(text_content)
    
    # We use pandoc to convert the markdown/txt to a Word document.
    # explicit format='markdown' to handle txt extension gracefully.
    intermediate_file = "temp_intermediate.docx"
    pypandoc.convert_file(
        temp_input, 
        'docx', 
        format='markdown', 
        outputfile=intermediate_file, 
        extra_args=['--wrap=none']
    )

    print("Applying page size A4 and borders...")
    # Open the generated docx to apply A4 size and borders
    doc = docx.Document(intermediate_file)
    
    set_page_borders_and_margins(doc)
    apply_formatting(doc)
    
    # Save the final document
    doc.save(output_file)
    
    # Cleanup temporary file
    if os.path.exists(intermediate_file):
        os.remove(intermediate_file)
    if 'temp_input' in locals() and os.path.exists(temp_input):
        os.remove(temp_input)

    print(f"Successfully created properly formatted word document: {output_file}")

if __name__ == "__main__":
    # You can change input/output filenames here
    input_filename = "input.txt"
    output_filename = "output.docx"
    
    if len(sys.argv) > 1:
        input_filename = sys.argv[1]
    if len(sys.argv) > 2:
        output_filename = sys.argv[2]
        
    convert_txt_to_docx(input_filename, output_filename)
