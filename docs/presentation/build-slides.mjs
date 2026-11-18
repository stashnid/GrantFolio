// Source for the live presentation. All geometry uses CSS pixels.
export function build(presentation, slides) {
  presentation.theme.defaultFont = 'Arial';
  for (const [i, data] of slides.entries()) {
    const slide = presentation.slides.add();
    slide.setViewportSize(1280, 720);
    slide.background.fill = data.dark ? '#111F3B' : '#F4F6FB';
    for (const item of data.text) {
      const [value, x, y, width, height, size, weight, tone] = item;
      const shape = slide.shapes.add({geometry:'textbox', position:{left:x,top:y,width,height},fill:'none',line:{fill:'none',width:0}});
      shape.text = value;
      shape.text.style = {fontFamily:'Arial',fontSize:size,bold:weight===700,color:tone || (data.dark ? '#FFFFFF' : '#152344')};
    }
    const page = slide.shapes.add({geometry:'textbox',position:{left:1160,top:672,width:55,height:25},fill:'none',line:{fill:'none',width:0}});
    page.text = String(i+1).padStart(2,'0');
    page.text.style = {fontFamily:'Arial',fontSize:17,color:data.dark?'#A5B5D1':'#53627C'};
    slide.speakerNotes.text = data.notes;
  }
}
