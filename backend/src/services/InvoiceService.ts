import PDFDocument from 'pdfkit'
import { BookingRecord, PropertyRecord, RoomTypeRecord } from '../types'
import { gstRatePercentFor } from '../lib/pricing'

/**
 * The billing entity printed on every GST invoice.
 *
 * These were placeholders until 27 Jul 2026 — "Quadis Hospitality Pvt. Ltd."
 * with GSTIN 09AAACQ1234F1Z9, neither of which exists. Issuing a tax invoice
 * under an invented GSTIN is a filing problem for the client, not a cosmetic
 * one, so they are now the real values the client supplied.
 *
 * The registered address came from the client on 27 Jul 2026 and is in East
 * Delhi, which is why the GSTIN state code is 07 (Delhi) rather than 09 (Uttar
 * Pradesh) even though six of the nine properties are in Noida. The invoice
 * must carry the registered address of the entity raising it, not the address
 * of the hotel the guest stayed at — that appears separately as the place of
 * supply.
 */
const LEGAL_ENTITY = 'Quadis Services Private Limited'
const GSTIN = '07AAACQ4872H1ZA'
const REGISTERED_ADDRESS =
  'G/F, 9/2672, Plot No 22-H, Gali Number 17, Kailash Nagar,\nEast Delhi, Delhi — 110031'

export class InvoiceService {
  public async generateGstInvoicePdf(
    booking: BookingRecord,
    property: PropertyRecord | null,
    room: RoomTypeRecord | null
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' })
        const chunks: Buffer[] = []

        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', (err) => reject(err))

        const propertyName = property?.name || 'Quadis Hotel'
        const propertyAddress = property?.address || 'Sector 51, Noida, Uttar Pradesh'
        const roomName = room?.name || 'Executive Room'

        // Calculate nights
        const checkInDate = new Date(booking.check_in)
        const checkOutDate = new Date(booking.check_out)
        const nights = Math.max(
          1,
          Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
        )

        const totalAmount = Number(booking.total_amount)
        const ratePerRoomNight = totalAmount / (nights * booking.rooms_count)

        // Indian GST SAC 996311 slab rule: under ₹7,500 a night = 5% (2.5%+2.5%),
        // ₹7,500 and over = 18% (9%+9%). The lower slab was 12% until the client
        // corrected it on 5 Aug 2026 — "our gst is 5%, so please replace 12% with
        // 5%" — which matches the September 2025 rate revision. The rates live in
        // ../lib/pricing so the checkout summary and this invoice cannot disagree;
        // see the note there.
        //
        // CGST and SGST are each half the slab, so a 5% invoice prints 2.5% + 2.5%.
        // That is a fraction rather than the whole number 12% gave, which is why
        // halfRate is formatted rather than assumed to be an integer.
        const gstRatePercent = gstRatePercentFor(ratePerRoomNight)
        const halfRate = gstRatePercent / 2

        const taxableBase = Math.round((totalAmount / (1 + gstRatePercent / 100)) * 100) / 100
        const totalTax = Math.round((totalAmount - taxableBase) * 100) / 100
        const cgst = Math.round((totalTax / 2) * 100) / 100
        const sgst = Math.round((totalTax - cgst) * 100) / 100

        // Header
        doc
          .fillColor('#111827')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('QUADIS HOTELS & RESORTS', { align: 'left' })
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#4B5563')
          .text(LEGAL_ENTITY)
          .text(REGISTERED_ADDRESS)
          .text(`GSTIN: ${GSTIN} | SAC Code: 996311`)
          .moveDown(1.5)

        // Divider
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').lineWidth(1).stroke().moveDown(1.5)

        // Invoice Title & Metadata
        const startY = doc.y
        doc
          .fillColor('#111827')
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('TAX INVOICE / RECEIPT', 50, startY)

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#374151')
          .text(`Invoice No: INV-${booking.booking_code}`, 50, startY + 25)
          .text(`Invoice Date: ${new Date().toLocaleDateString('en-IN')}`, 50, startY + 40)
          .text(`Booking Status: ${booking.booking_status}`, 50, startY + 55)
          .text(`Payment Status: ${booking.payment_status}`, 50, startY + 70)
          .text(`Razorpay Payment ID: ${booking.razorpay_payment_id || 'ONLINE_INSTANT'}`, 50, startY + 85)

        // Guest Details on Right Column
        doc
          .font('Helvetica-Bold')
          .text('BILLED TO (GUEST):', 320, startY + 25)
          .font('Helvetica')
          .text(`Name: ${booking.guest_name}`, 320, startY + 40)
          .text(`Phone: +91 ${booking.guest_phone}`, 320, startY + 55)
          .text(`Email: ${booking.guest_email || 'N/A'}`, 320, startY + 70)

        if (booking.company_name) {
          doc.text(`Company: ${booking.company_name}`, 320, startY + 85)
          doc.text(`Guest GSTIN: ${booking.gstin || 'N/A'}`, 320, startY + 100)
        }

        doc.y = startY + 130
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').stroke().moveDown(1.5)

        // Accommodation Details Table Header
        const tableY = doc.y
        doc.fillColor('#F3F4F6').rect(50, tableY, 495, 25).fill()
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('ACCOMMODATION DESCRIPTION', 60, tableY + 8)
          .text('NIGHTS', 300, tableY + 8)
          .text('ROOMS', 360, tableY + 8)
          .text('AMOUNT (INR)', 430, tableY + 8, { width: 100, align: 'right' })

        // Accommodation Row
        const rowY = tableY + 35
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#111827')
          .text(`${propertyName} — ${roomName}`, 60, rowY)
          .fontSize(9)
          .fillColor('#6B7280')
          .text(`Check-In: ${booking.check_in} | Check-Out: ${booking.check_out}`, 60, rowY + 15)
          .fillColor('#111827')
          .fontSize(10)
          .text(`${nights}`, 300, rowY)
          .text(`${booking.rooms_count}`, 360, rowY)
          .text(`₹${taxableBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 430, rowY, {
            width: 100,
            align: 'right',
          })

        doc.y = rowY + 45
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').stroke().moveDown(1)

        // Summary Breakdown right-aligned
        const summaryX = 330
        const valueX = 430
        let currentY = doc.y

        doc
          .font('Helvetica')
          .fontSize(10)
          .text('Taxable Base Amount:', summaryX, currentY)
          .text(`₹${taxableBase.toFixed(2)}`, valueX, currentY, { width: 100, align: 'right' })

        currentY += 18
        doc
          .text(`CGST (${halfRate}%):`, summaryX, currentY)
          .text(`₹${cgst.toFixed(2)}`, valueX, currentY, { width: 100, align: 'right' })

        currentY += 18
        doc
          .text(`SGST (${halfRate}%):`, summaryX, currentY)
          .text(`₹${sgst.toFixed(2)}`, valueX, currentY, { width: 100, align: 'right' })

        currentY += 22
        doc.moveTo(summaryX, currentY).lineTo(545, currentY).strokeColor('#111827').lineWidth(1.5).stroke()
        currentY += 8

        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#111827')
          .text('TOTAL PAID (INR):', summaryX, currentY)
          .text(`₹${totalAmount.toFixed(2)}`, valueX, currentY, { width: 100, align: 'right' })

        // Footer / Terms
        doc.y = currentY + 60
        doc
          .fontSize(9)
          .font('Helvetica-Oblique')
          .fillColor('#6B7280')
          .text('Note: This is an electronically generated SAC 996311 GST Tax Invoice and receipt.', 50, doc.y)
          .text('Thank you for staying at Quadis Hotels. We wish you a wonderful journey!', 50, doc.y + 15)

        // Signatory box
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(`For ${LEGAL_ENTITY}`, 350, doc.y + 25, { align: 'right' })
          .font('Helvetica')
          .fontSize(9)
          .text('Authorized Signatory', 350, doc.y + 18, { align: 'right' })

        doc.end()
      } catch (err) {
        reject(err)
      }
    })
  }
}

export const invoiceService = new InvoiceService()
