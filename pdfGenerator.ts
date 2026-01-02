import jsPDF from 'jspdf'

export interface BookingPDFData {
  referenceNumber: string
  bookingId?: string
  awb?: string
  service?: string
  sender: {
    fullName: string
    completeAddress: string
    contactNo: string
    emailAddress: string
    agentName?: string
    deliveryOption?: 'warehouse' | 'pickup'
  }
  receiver: {
    fullName: string
    completeAddress: string
    contactNo: string
    emailAddress: string
    deliveryOption: 'warehouse' | 'address'
    numberOfBoxes?: number
  }
  items: Array<{
    id: string
    commodity: string
    qty: number
  }>
  eidFrontImage?: string
  eidBackImage?: string
  philippinesIdFront?: string
  philippinesIdBack?: string
  customerImage?: string // Single image for backward compatibility
  customerImages?: string[] // Multiple face images
  submissionTimestamp?: string
  declarationText?: string // Declaration text that customer confirmed
}

export async function generateBookingPDF(data: BookingPDFData): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let yPos = margin

  // Determine route - handle various service name formats
  const serviceLower = data.service?.toLowerCase() || ''
  const isPhToUae = serviceLower === 'ph-to-uae'
  const routeDisplay = isPhToUae ? 'PH TO UAE' : 'UAE TO PHILIPPINES'
  
  console.log(`🔍 PDF Generation - Service: "${data.service}", Normalized: "${serviceLower}", isPhToUae: ${isPhToUae}, Route: ${routeDisplay}`)

  // Helper function to add new page
  const addNewPage = () => {
      doc.addPage()
      yPos = margin
  }

  // Helper function to draw a line
  const drawLine = (y: number, startX: number = margin, endX: number = pageWidth - margin) => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(startX, y, endX, y)
  }

  // Helper function to draw a box/rectangle
  const drawBox = (x: number, y: number, width: number, height: number, fillColor?: [number, number, number]) => {
    if (fillColor) {
      doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
      doc.rect(x, y, width, height, 'F')
    } else {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.5)
      doc.rect(x, y, width, height)
    }
  }

  // Helper function to add Banned Items section
  const addBannedItemsSection = () => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 128, 0) // Green color
    doc.text('BANNED ITEMS', margin, yPos)
    yPos += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0) // Black
    doc.text('Please be reminded that the following items are STRICTLY PROHIBITED from shipment:', margin, yPos)
    yPos += 8

    doc.setFontSize(9)
    const bannedItems = [
      'Flammable / Explosive Items',
      'Deadly Weapons',
      'Illegal Drugs / Vape / Cigarettes / Alcoholic Drinks',
      'Expensive / Original Jewelries (gold or silver)',
      'Money / Cash',
      'Live Animals',
      'Frozen Goods / Any Pork Items',
      'Medicines / Supplements / Capsules / Vitamins / Injectables',
      'Adult Toys',
      'Religious Items',
      'Long items (more than 200 cm are not allowed)',
      'Contact lens / Eye drops / Eye solution',
      'Perishable Goods (spoils easily)',
    ]

    bannedItems.forEach((item) => {
      doc.text(`• ${item}`, margin, yPos)
      yPos += 5
    })
    yPos += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Anything Illegal is STRICTLY BANNED.', margin, yPos)
    yPos += 10
  }

  // Helper function to add image to PDF
  const addImageToPDF = (imageData: string | undefined, x: number, y: number, width: number, height?: number, pageNumber?: number): Promise<number> => {
    return new Promise((resolve) => {
      try {
        // Check if image data exists
        if (!imageData || imageData.trim() === '') {
          console.warn('Image data is empty or undefined')
          if (pageNumber) doc.setPage(pageNumber)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.text('Image not available', x, y + 5)
          resolve(20)
          return
        }

        // Capture pageNumber in closure to ensure it's available in async callbacks
        const targetPage = pageNumber

        const img = new Image()
        img.crossOrigin = 'anonymous'
        
        img.onload = () => {
          try {
            console.log(`🖼️ Image loaded: ${img.width}x${img.height}, target page: ${targetPage}, position: (${x}, ${y})`)
            
            let format: 'JPEG' | 'PNG' = 'JPEG'
            let imageDataForPDF = imageData
            
            // Handle different image data formats
            if (imageData.startsWith('data:image/png')) {
              format = 'PNG'
              imageDataForPDF = imageData.split(',')[1]
            } else if (imageData.startsWith('data:image/jpeg') || imageData.startsWith('data:image/jpg')) {
              format = 'JPEG'
              imageDataForPDF = imageData.split(',')[1]
            } else if (!imageData.includes(',')) {
              // Assume it's already base64 without data URL prefix
              imageDataForPDF = imageData
              // Try to detect format from first bytes or default to JPEG
              if (imageData.startsWith('iVBORw0KGgo')) {
                format = 'PNG'
              }
            } else {
              imageDataForPDF = imageData.split(',')[1]
            }
            
            console.log(`📄 Image format: ${format}, base64 length: ${imageDataForPDF ? imageDataForPDF.length : 0}`)
            
            // Validate image dimensions
            if (img.width === 0 || img.height === 0) {
              throw new Error('Invalid image dimensions')
            }
            
            // Calculate height maintaining aspect ratio
            let finalHeight = (img.height * width) / img.width
            console.log(`📏 Calculated: ${width}x${finalHeight}, max allowed: ${height || 'none'}`)
            
            // CRITICAL: Set page immediately before addImage - do this synchronously
            if (targetPage) {
              doc.setPage(targetPage)
              console.log(`📑 Page set to ${targetPage}`)
            }
            
            // If max height is specified and calculated height exceeds it, scale down
            let actualX = x
            let actualY = y
            let actualWidth = width
            let actualHeight = finalHeight
            
            if (height && finalHeight > height) {
              const scale = height / finalHeight
              actualHeight = height
              actualWidth = width * scale
              actualX = x + (width - actualWidth) / 2 // Center the image
            }
            
            // Set page one more time right before addImage to be absolutely sure
            if (targetPage) {
              doc.setPage(targetPage)
            }
            
            // Add the image
            doc.addImage(imageDataForPDF, format, actualX, actualY, actualWidth, actualHeight)
            console.log(`✅ Image added successfully: ${actualWidth}x${actualHeight} at (${actualX}, ${actualY}) on page ${targetPage || 'current'}`)
            
            resolve(actualHeight)
          } catch (error) {
            console.error(`❌ Error adding image to PDF:`, error)
            if (targetPage) doc.setPage(targetPage)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.text('Image not available', x, y + 5)
            resolve(20)
          }
        }
        
        img.onerror = (error) => {
          console.error(`Image load error:`, error, imageData?.substring(0, 50))
          if (targetPage) doc.setPage(targetPage)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.text('Image not available', x, y + 5)
          resolve(20)
        }
        
        // Set image source
        img.src = imageData
      } catch (error) {
        console.error(`Error processing image:`, error)
        if (pageNumber) doc.setPage(pageNumber)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text('Image not available', x, y + 5)
        resolve(20)
      }
    })
  }

  // ============================================
  // PAGE 1: BOOKING FORM
  // ============================================
  
  // Header Section
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 128, 0) // Green color
  doc.text('KNEX DELIVERY SERVICES L.L.C', margin, yPos)
  yPos += 6

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0) // Black
  doc.text('Rocky Warehouse Warehouse #19, 11th Street, Al Qusais Industrial Area 1, Dubai, 0000 United Arab Emirates', margin, yPos)
  yPos += 4
  doc.text('+971559738713', margin, yPos)
  yPos += 6

  // AWB Number - Prominently displayed in header
  if (data.awb) {
    yPos += 4
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 128, 0) // Green color
    doc.text('AWB:', margin, yPos)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(data.awb, margin + 20, yPos)
    yPos += 8
  }

  // Route display
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 128, 0) // Green color
  doc.text(routeDisplay, margin, yPos)
  yPos += 8

  drawLine(yPos)
  yPos += 10

  // Sender and Receiver Details (Two Columns)
  const columnWidth = (pageWidth - (margin * 3)) / 2
  const leftColumnX = margin
  const rightColumnX = margin * 2 + columnWidth
  const startY = yPos

  // Left Column - Sender Details
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 128, 0)
  // For PH to UAE: Sender is in PH, For UAE to PH: Sender is in UAE
  const senderLabel = isPhToUae ? '(PH) SENDER DETAILS' : '(UAE) SENDER DETAILS'
  doc.text(senderLabel, leftColumnX, yPos)
  yPos += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  
  // Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('NAME', leftColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.sender.fullName || '', leftColumnX, yPos)
  yPos += 8

  // Complete Address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('COMPLETE ADDRESS', leftColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const addressLines = doc.splitTextToSize(data.sender.completeAddress || '', columnWidth - 2)
  addressLines.forEach((line: string) => {
    doc.text(line, leftColumnX, yPos)
    yPos += 4
  })
  yPos += 4

  // Contact No
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('CONTACT NO.', leftColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.sender.contactNo || '', leftColumnX, yPos)
  yPos += 8

  // Email Address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('EMAIL ADDRESS', leftColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.sender.emailAddress || '', leftColumnX, yPos)
  yPos += 8

  // Agent Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('AGENT NAME', leftColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.sender.agentName || '', leftColumnX, yPos)
  yPos += 8

  // Delivery Options (checkboxes) - Based on route and sender delivery option
  doc.setFontSize(7)
  
  if (isPhToUae) {
    // For PH to UAE: Show drop off options for sender (in Philippines)
    const isDropOffToWarehouse = data.sender.deliveryOption === 'warehouse'
    const isSchedulePickup = data.sender.deliveryOption === 'pickup'
    
    // Checkbox for DROP OFF TO WAREHOUSE
    doc.text(isDropOffToWarehouse ? '☑' : '☐', leftColumnX, yPos)
    doc.text('DROP OFF TO WAREHOUSE', leftColumnX + 5, yPos)
    yPos += 4
    
    // Checkbox for SCHEDULE A PICKUP (usually unchecked for PH to UAE)
    doc.text(isSchedulePickup ? '☑' : '☐', leftColumnX, yPos)
    doc.text('SCHEDULE A PICKUP', leftColumnX + 5, yPos)
  } else {
    // For UAE to PH: Show UAE warehouse pickup options
    const isWarehousePickup = data.sender.deliveryOption === 'warehouse' || data.sender.deliveryOption === 'pickup'
    // Receiver deliveryOption is 'warehouse' | 'address' where 'address' means delivery
    const isDeliverToAddress = data.receiver.deliveryOption === 'address'
    
    // Checkbox for UAE WAREHOUSE PICK-UP (sender side - warehouse/pickup)
    doc.text(isWarehousePickup ? '☑' : '☐', leftColumnX, yPos)
    doc.text('UAE WAREHOUSE PICK-UP', leftColumnX + 5, yPos)
    yPos += 4
    
    // Checkbox for DELIVER TO UAE ADDRESS (receiver side - delivery)
    doc.text(isDeliverToAddress ? '☑' : '☐', leftColumnX, yPos)
    doc.text('DELIVER TO UAE ADDRESS', leftColumnX + 5, yPos)
  }
  
  yPos += 8

  // Right Column - Receiver Details
  yPos = startY
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 128, 0)
  // For PH to UAE: Receiver is in UAE, For UAE to PH: Receiver is in PH
  const receiverLabel = isPhToUae ? '(UAE) RECEIVER DETAILS' : '(PH) RECEIVER DETAILS'
  doc.text(receiverLabel, rightColumnX, yPos)
  yPos += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)

  // Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('NAME', rightColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.receiver.fullName || '', rightColumnX, yPos)
  yPos += 8

  // Complete Address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('COMPLETE ADDRESS', rightColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const receiverAddressLines = doc.splitTextToSize(data.receiver.completeAddress || '', columnWidth - 2)
  receiverAddressLines.forEach((line: string) => {
    doc.text(line, rightColumnX, yPos)
    yPos += 4
  })
  yPos += 4

  // Contact No
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('CONTACT NO.', rightColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.receiver.contactNo || '', rightColumnX, yPos)
  yPos += 8

  // Email Address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('EMAIL ADDRESS', rightColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.receiver.emailAddress || '', rightColumnX, yPos)
  yPos += 8

  // Number of Box/Parcel
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('NUMBER OF BOX / PARCEL', rightColumnX, yPos)
  yPos += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text((data.receiver.numberOfBoxes || '').toString(), rightColumnX, yPos)
  yPos += 8

  // Find the maximum Y position from both columns
  const maxY = Math.max(yPos, startY + 80)
  yPos = maxY + 5

  // Items Declaration Table
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Commodity | Items Declaration', margin, yPos)
  yPos += 8

  // Calculate number of items and rows needed dynamically
  const totalItems = data.items ? data.items.length : 0
  const itemsPerTable = Math.ceil(totalItems / 2) // Split items between two tables
  const leftTableRows = itemsPerTable // Left table gets first half
  const rightTableRows = totalItems - itemsPerTable // Right table gets remaining items

  const tableWidth = (pageWidth - (margin * 3)) / 2
  const tableStartY = yPos
  const rowHeight = 6
  const headerHeight = 8

  // Left Table (Items 1 to itemsPerTable)
  const leftTableX = margin
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  
  // Header
  drawBox(leftTableX, tableStartY, tableWidth, headerHeight)
  doc.text('NO.', leftTableX + 2, tableStartY + 5)
  doc.text('COMMODITY | ITEMS', leftTableX + 12, tableStartY + 5)
  doc.text('QTY', leftTableX + tableWidth - 15, tableStartY + 5)

  // Rows - only show rows for actual items
  for (let i = 0; i < leftTableRows; i++) {
    const rowY = tableStartY + headerHeight + (i * rowHeight)
    drawBox(leftTableX, rowY, tableWidth, rowHeight)
    doc.setFont('helvetica', 'normal')
    
    if (data.items && data.items[i]) {
      const item = data.items[i]
      doc.text((i + 1).toString(), leftTableX + 2, rowY + 4)
      const commodityLines = doc.splitTextToSize(item.commodity || '', tableWidth - 25)
      doc.text(commodityLines[0] || '', leftTableX + 12, rowY + 4)
      doc.text(item.qty.toString(), leftTableX + tableWidth - 15, rowY + 4)
    } else {
      // Empty row if no item
      doc.text((i + 1).toString(), leftTableX + 2, rowY + 4)
    }
  }

  // Right Table (Items itemsPerTable+1 to totalItems)
  const rightTableX = margin * 2 + tableWidth
  doc.setFont('helvetica', 'bold')
  
  // Header
  drawBox(rightTableX, tableStartY, tableWidth, headerHeight)
  doc.text('NO.', rightTableX + 2, tableStartY + 5)
  doc.text('COMMODITY | ITEMS', rightTableX + 12, tableStartY + 5)
  doc.text('QTY', rightTableX + tableWidth - 15, tableStartY + 5)

  // Rows - only show rows for actual items
  for (let i = 0; i < rightTableRows; i++) {
    const rowY = tableStartY + headerHeight + (i * rowHeight)
    drawBox(rightTableX, rowY, tableWidth, rowHeight)
    doc.setFont('helvetica', 'normal')
    
    const itemIndex = i + itemsPerTable
    if (data.items && data.items[itemIndex]) {
      const item = data.items[itemIndex]
      doc.text((itemIndex + 1).toString(), rightTableX + 2, rowY + 4)
      const commodityLines = doc.splitTextToSize(item.commodity || '', tableWidth - 25)
      doc.text(commodityLines[0] || '', rightTableX + 12, rowY + 4)
      doc.text(item.qty.toString(), rightTableX + tableWidth - 15, rowY + 4)
    } else {
      // Empty row if no item
      doc.text((itemIndex + 1).toString(), rightTableX + 2, rowY + 4)
    }
  }

  // Update yPos based on the maximum number of rows between both tables
  const maxRows = Math.max(leftTableRows, rightTableRows, 1) // At least 1 row
  yPos = tableStartY + headerHeight + (maxRows * rowHeight) + 10

  // Important Declaration
  yPos += 5
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 128, 0) // Green color for consistency
  doc.text('Important Declaration', margin, yPos)
  yPos += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0) // Black
  const declarationText = data.declarationText || 'By proceeding with this shipment, I declare that the contents of my shipment do not contain any prohibited, illegal, or restricted items under international or local laws. I fully understand that shipping illegal goods constitutes a criminal offense and is punishable by law. I acknowledge that KNEX Delivery Services acts solely as a carrier and shall not be held responsible for the nature, condition, or contents of the shipment.'
  const declarationLines = doc.splitTextToSize(declarationText, pageWidth - (margin * 2))
  declarationLines.forEach((line: string) => {
    doc.text(line, margin, yPos)
    yPos += 4
  })
  yPos += 6

  // Checkbox confirmation - using check.png image
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  
  // Load and add check.png image
  const checkImageSize = 5 // Match font size (9pt ≈ 5mm)
  const checkImagePromise = new Promise<void>((resolve) => {
    try {
      const checkImg = new Image()
      checkImg.crossOrigin = 'anonymous'
      checkImg.onload = () => {
        try {
          // Convert image to base64
          const canvas = document.createElement('canvas')
          canvas.width = checkImg.width
          canvas.height = checkImg.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(checkImg, 0, 0)
            const imageData = canvas.toDataURL('image/png')
            const format: 'PNG' = 'PNG'
            const imageDataForPDF = imageData.split(',')[1]
            doc.addImage(imageDataForPDF, format, margin, yPos - checkImageSize, checkImageSize, checkImageSize)
          }
        } catch (error) {
          console.error('Error adding check image:', error)
        }
        resolve()
      }
      checkImg.onerror = () => {
        console.error('Error loading check.png')
        resolve()
      }
      checkImg.src = '/check.png'
    } catch (error) {
      console.error('Error processing check image:', error)
      resolve()
    }
  })
  
  await checkImagePromise
  
  // Add text next to checkbox
  doc.text('I have read and agree to the Important Declaration above.', margin + checkImageSize + 2, yPos)
  
  // End of Page 1 - Core booking form data only

  // ============================================
  // PAGE 2: INFORMATION SECTIONS
  // ============================================
  addNewPage()
  
  yPos = margin + 10

  // Dropping Point (for PH to UAE)
  if (isPhToUae) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 128, 0) // Green color
    doc.text('DROPPING POINT', margin, yPos)
    yPos += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0) // Black
    doc.text('ADDRESS: #81 Dr. A. Santos Ave., Brgy. San Antonio, Parañaque City 1700', margin, yPos)
    yPos += 6

    doc.text('NEAREST LANDMARK: ORIGINAL PARIS AND INFRONT OF LOYOLA MEMORIAL PARK', margin, yPos)
    yPos += 6

    doc.text('CONTACT PERSON: CARMEN SUBA', margin, yPos)
    yPos += 6

    doc.text('CONTACT NO.: +63 938 490 2564', margin, yPos)
    yPos += 12
  }

  // Loading Schedules (for PH to UAE)
  if (isPhToUae) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 128, 0) // Green color
    doc.text('LOADING SCHEDULES', margin, yPos)
    yPos += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0) // Black
    doc.text('TUESDAY LOADING: (RECEIVING TIME: 10:00 AM to 8:00 PM)', margin, yPos)
    yPos += 6
    doc.text('Friday Arrival (Saturday or Sunday Delivery)', margin, yPos)
    yPos += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Monday is our cut-off day!', margin, yPos)
    yPos += 10

    doc.setFont('helvetica', 'normal')
    doc.text('FRIDAY LOADING: (RECEIVING TIME: 10:00 AM to 8:00 PM)', margin, yPos)
    yPos += 6
    doc.text('Monday Arrival (Monday or Tuesday Delivery)', margin, yPos)
    yPos += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Thursday is our cut-off day!', margin, yPos)
    yPos += 12
  }

  // Banned Items on Page 2
  addBannedItemsSection()

  // ============================================
  // PAGE 3: ID IMAGES (All 4 Cards - 2x2 Grid)
  // ============================================
  addNewPage()
  const page3Number = doc.getNumberOfPages()

  const imageMargin = 20
  const imageSpacing = 15
  const imageWidth = (pageWidth - (imageMargin * 2) - imageSpacing) / 2
  const leftImageX = imageMargin
  const rightImageX = imageMargin + imageWidth + imageSpacing
  
  // Calculate positions for 2x2 grid
  const topRowY = 30
  const bottomRowY = topRowY + 100 // Space for top row images + spacing
  const maxImageHeight = 90 // Reduced height to fit 2 rows

  console.log(`🔍 Page 3 - Showing all ID cards`)
  console.log(`🔍 EID Front: ${!!data.eidFrontImage}, EID Back: ${!!data.eidBackImage}`)
  console.log(`🔍 PH ID Front: ${!!data.philippinesIdFront}, PH ID Back: ${!!data.philippinesIdBack}`)

  // Top Row - Left: Emirates ID Front
  doc.setPage(page3Number)
  if (data.eidFrontImage) {
    console.log('✅ Adding Emirates ID Front image...')
    await addImageToPDF(data.eidFrontImage, leftImageX, topRowY, imageWidth, maxImageHeight, page3Number)
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Emirates ID - Front', leftImageX, topRowY - 8)
  } else {
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(128, 128, 128)
    doc.text('Emirates ID - Front (Not Provided)', leftImageX, topRowY - 8)
  }

  // Top Row - Right: Emirates ID Back
  doc.setPage(page3Number)
  if (data.eidBackImage) {
    console.log('✅ Adding Emirates ID Back image...')
    await addImageToPDF(data.eidBackImage, rightImageX, topRowY, imageWidth, maxImageHeight, page3Number)
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Emirates ID - Back', rightImageX, topRowY - 8)
  } else {
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(128, 128, 128)
    doc.text('Emirates ID - Back (Not Provided)', rightImageX, topRowY - 8)
  }

  // Bottom Row - Left: Philippines ID Front
  doc.setPage(page3Number)
  if (data.philippinesIdFront) {
    console.log('✅ Adding Philippines ID Front image...')
    await addImageToPDF(data.philippinesIdFront, leftImageX, bottomRowY, imageWidth, maxImageHeight, page3Number)
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
      doc.text('Philippines ID - Front', leftImageX, bottomRowY - 5)
    } else {
      doc.setPage(page3Number)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(128, 128, 128)
      doc.text('Philippines ID - Front (Not Provided)', leftImageX, bottomRowY - 5)
  }

  // Bottom Row - Right: Philippines ID Back
  doc.setPage(page3Number)
  if (data.philippinesIdBack) {
    console.log('✅ Adding Philippines ID Back image...')
    await addImageToPDF(data.philippinesIdBack, rightImageX, bottomRowY, imageWidth, maxImageHeight, page3Number)
    doc.setPage(page3Number)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
      doc.text('Philippines ID - Back', rightImageX, bottomRowY - 5)
    } else {
      doc.setPage(page3Number)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(128, 128, 128)
      doc.text('Philippines ID - Back (Not Provided)', rightImageX, bottomRowY - 5)
  }

  // ============================================
  // PAGE 4: SELFIE/FACE IMAGES (Side by Side)
  // ============================================
  addNewPage()
  const page4Number = doc.getNumberOfPages()

  // Re-define image variables for page 4
  const page4ImageMargin = 20
  const page4ImageSpacing = 15
  const page4ImageWidth = (pageWidth - (page4ImageMargin * 2) - page4ImageSpacing) / 2
  const page4LeftImageX = page4ImageMargin
  const page4RightImageX = page4ImageMargin + page4ImageWidth + page4ImageSpacing
  const page4ImageStartY = 40
  const page4MaxImageHeight = (pageHeight - page4ImageStartY - margin) * 0.8

  const customerPhotos = data.customerImages && data.customerImages.length > 0 
    ? data.customerImages 
    : (data.customerImage ? [data.customerImage] : [])
  
  if (customerPhotos.length > 0) {
    if (customerPhotos.length === 1) {
      // Center single image if only one photo
      const centeredX = (pageWidth - page4ImageWidth) / 2
      await addImageToPDF(customerPhotos[0], centeredX, page4ImageStartY, page4ImageWidth, page4MaxImageHeight, page4Number)
      doc.setPage(page4Number)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Customer Photo', centeredX, page4ImageStartY - 8)
    } else {
      // Multiple photos - display side by side
      // Left side selfie
      if (customerPhotos[0]) {
        await addImageToPDF(customerPhotos[0], page4LeftImageX, page4ImageStartY, page4ImageWidth, page4MaxImageHeight, page4Number)
        doc.setPage(page4Number)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Customer Photo - 1', page4LeftImageX, page4ImageStartY - 8)
      }

      // Right side selfie
      if (customerPhotos.length > 1 && customerPhotos[1]) {
        await addImageToPDF(customerPhotos[1], page4RightImageX, page4ImageStartY, page4ImageWidth, page4MaxImageHeight, page4Number)
        doc.setPage(page4Number)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Customer Photo - 2', page4RightImageX, page4ImageStartY - 8)
      }
    }
  } else {
    // Show message if no photos available
    doc.setPage(page4Number)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(128, 128, 128)
    doc.text('No customer photos available', margin, page4ImageStartY)
  }

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const footerY = pageHeight - margin - 15
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text('Rocky Warehouse Warehouse #19, 11th Street, Al Qusais Industrial Area 1, Dubai, 0000 United Arab Emirates', pageWidth / 2, footerY, { align: 'center' })
    doc.text('+971559738713', pageWidth / 2, footerY + 5, { align: 'center' })
  }

  // Output PDF - Open in new tab AND download simultaneously
  const fileName = data.awb ? `Booking-${data.awb}.pdf` : `Booking-${data.referenceNumber}.pdf`
  
  // Detect device type for better handling
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  const isAndroid = /Android/.test(navigator.userAgent)
  const isMobile = isIOS || isAndroid
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const isIOSSafari = isIOS && isSafari
  
  console.log(`📱 Device detected - iOS: ${isIOS}, Android: ${isAndroid}, Mobile: ${isMobile}, iOS Safari: ${isIOSSafari}`)
  
  if (isIOSSafari) {
    // iOS Safari: Use blob URL method (more reliable than data URLs)
    console.log('📱 iOS Safari detected - using blob URL method')
    try {
      // Use Blob instead of data URL
      const pdfBlob = doc.output('blob')
      const pdfUrl = URL.createObjectURL(pdfBlob)
      console.log('✅ PDF blob URL generated:', pdfUrl)
      
      // Create modal overlay
      const modal = document.createElement('div')
      modal.id = 'pdf-viewer-modal'
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      `
      
      // Create modal content container
      const modalContent = document.createElement('div')
      modalContent.style.cssText = `
        width: 95%;
        height: 95%;
        max-width: 1200px;
        max-height: 90vh;
        background: white;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        overflow: hidden;
      `
      
      // Create header with title and close button
      const header = document.createElement('div')
      header.style.cssText = `
        padding: 15px 20px;
        background: #007AFF;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        font-size: 18px;
      `
      header.innerHTML = `
        <span>📄 Booking Form${data.awb ? ` - AWB: ${data.awb}` : ` - ${data.referenceNumber}`}</span>
        <button id="pdf-modal-close" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          font-size: 24px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        ">✕</button>
      `
      
      // Create iframe to display PDF (using blob URL)
      const iframe = document.createElement('iframe')
      iframe.src = pdfUrl
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        flex: 1;
      `
      iframe.setAttribute('type', 'application/pdf')
      
      // Create footer with open button
      const footer = document.createElement('div')
      footer.style.cssText = `
        padding: 15px 20px;
        background: #f5f5f5;
        display: flex;
        justify-content: center;
        gap: 10px;
        border-top: 1px solid #ddd;
      `
      
      const downloadBtn = document.createElement('a')
      downloadBtn.href = pdfUrl
      downloadBtn.target = '_blank'  // iOS will open in native viewer
      downloadBtn.textContent = '📥 Open in new tab'
      downloadBtn.style.cssText = `
        padding: 12px 24px;
        background: #007AFF;
        color: white;
        text-decoration: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        display: inline-block;
      `
      footer.appendChild(downloadBtn)
      
      // Assemble modal
      modalContent.appendChild(header)
      modalContent.appendChild(iframe)
      modalContent.appendChild(footer)
      modal.appendChild(modalContent)
      
      // Close handler with blob URL cleanup
      const closeModal = () => {
        if (modal.parentNode) {
          document.body.removeChild(modal)
          URL.revokeObjectURL(pdfUrl)  // Cleanup blob URL
          console.log('✅ PDF modal closed and blob URL revoked')
        }
      }
      
      // Add close button handler
      header.querySelector('#pdf-modal-close')?.addEventListener('click', closeModal)
      
      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal()
        }
      })
      
      // Close on Escape key
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeModal()
          document.removeEventListener('keydown', escapeHandler)
        }
      }
      document.addEventListener('keydown', escapeHandler)
      
      // Append to body
      document.body.appendChild(modal)
      console.log('✅ PDF modal created and displayed with blob URL')
      
    } catch (error) {
      console.error('❌ Error with iOS Safari PDF generation:', error)
      // Fallback: try standard method
      try {
        doc.save(fileName)
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError)
      }
    }
    return  // Exit early for iOS Safari
  } else {
    // For other browsers: Use blob URL approach
    const pdfBlob = doc.output('blob')
    const blobUrl = URL.createObjectURL(pdfBlob)
    
    // Step 1: Always try to open PDF in new tab
    try {
      const newWindow = window.open(blobUrl, '_blank')
      
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        console.log('⚠️ Popup blocked - trying alternative method')
        const openLink = document.createElement('a')
        openLink.href = blobUrl
        openLink.target = '_blank'
        openLink.style.display = 'none'
        document.body.appendChild(openLink)
        openLink.click()
        setTimeout(() => {
          if (openLink.parentNode) {
            document.body.removeChild(openLink)
          }
        }, 100)
      } else {
        console.log('✅ PDF opened in new tab')
      }
    } catch (error) {
      console.warn('⚠️ Error opening PDF in new tab:', error)
    }
    
    // Step 2: Always try to download the PDF
    try {
      if (isIOS) {
        // iOS (non-Safari): Try link download
        console.log('📱 iOS detected - attempting download via link')
        const downloadLink = document.createElement('a')
        downloadLink.href = blobUrl
        downloadLink.download = fileName
        downloadLink.style.display = 'none'
        document.body.appendChild(downloadLink)
        downloadLink.click()
        setTimeout(() => {
          if (downloadLink.parentNode) {
            document.body.removeChild(downloadLink)
          }
        }, 100)
      } else {
        // Android and Desktop: Use standard download method
        console.log('💾 Downloading PDF...')
        doc.save(fileName)
      }
    } catch (error) {
      console.warn('⚠️ Error downloading PDF:', error)
      // Fallback: Try using link download method
      try {
        const downloadLink = document.createElement('a')
        downloadLink.href = blobUrl
        downloadLink.download = fileName
        downloadLink.style.display = 'none'
        document.body.appendChild(downloadLink)
        downloadLink.click()
        setTimeout(() => {
          if (downloadLink.parentNode) {
            document.body.removeChild(downloadLink)
          }
        }, 100)
      } catch (fallbackError) {
        console.error('❌ Could not download PDF:', fallbackError)
      }
    }
    
    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
      console.log('🧹 Blob URL cleaned up')
    }, isMobile ? 5000 : 2000)
  }
}
