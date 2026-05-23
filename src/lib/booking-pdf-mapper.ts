import {
  generateBookingPDF,
  normalizeReceiverDeliveryOptionForPdf,
  parseDeclaredAmountFromBooking,
  pickUaePassUserInfoFromBooking,
  type BookingPDFData,
} from '../../pdfGenerator';

export type MapBookingPdfOptions = {
  excludeIdentityDocuments?: boolean;
};

function getImageSrc(imageField: string | undefined): string | undefined {
  if (!imageField) return undefined;
  if (imageField.startsWith('data:image') || imageField.startsWith('http')) {
    return imageField;
  }
  return imageField;
}

/** Map API booking document to PDF payload (optional: omit ID images and related pages). */
export function mapBookingRecordToPdfData(
  fullBooking: Record<string, unknown>,
  options: MapBookingPdfOptions = {}
): BookingPDFData {
  const excludeIdentity = options.excludeIdentityDocuments === true;
  const senderData = (fullBooking.sender as Record<string, unknown>) || {};
  const receiverData = (fullBooking.receiver as Record<string, unknown>) || {};

  const serviceCode =
    (fullBooking.service as string) ||
    (fullBooking.service_code as string) ||
    ((fullBooking.request_id as Record<string, unknown>)?.service as string) ||
    '';

  const awbNumber =
    (fullBooking.awb as string) ||
    (fullBooking.awb_number as string) ||
    (fullBooking.awbNumber as string) ||
    '';

  const referenceNumber =
    fullBooking._id?.toString() ||
    ((fullBooking.request_id as Record<string, unknown>)?._id?.toString()) ||
    (fullBooking.booking_id as string) ||
    '';

  const bookingItems = Array.isArray(fullBooking.items)
    ? fullBooking.items
    : Array.isArray(fullBooking.orderItems)
      ? fullBooking.orderItems
      : Array.isArray(fullBooking.listedItems)
        ? fullBooking.listedItems
        : [];

  const pdfItems = (bookingItems as Record<string, unknown>[]).map((item, index) => ({
    id: (item?.id as string) || (item?._id as { toString(): string })?.toString?.() || `item-${index}`,
    commodity:
      (item?.commodity as string) ||
      (item?.name as string) ||
      (item?.description as string) ||
      (item?.item as string) ||
      'N/A',
    qty: (item?.qty as number) || (item?.quantity as number) || 1,
  }));

  const idDocs =
    (fullBooking.identityDocuments as Record<string, unknown>) ||
    ((fullBooking.collections as Record<string, unknown>)?.identityDocuments as Record<string, unknown>) ||
    {};

  const senderDeliveryOption =
    (senderData.deliveryOption as string) ||
    (senderData.delivery_option as string) ||
    (fullBooking.sender_delivery_option as string) ||
    'warehouse';

  const receiverDeliveryOption =
    (receiverData.deliveryOption as string) ||
    (receiverData.delivery_option as string) ||
    (fullBooking.receiver_delivery_option as string) ||
    'warehouse';

  const pdfData: BookingPDFData = {
    referenceNumber,
    bookingId: fullBooking._id?.toString(),
    awb: awbNumber || undefined,
    service: serviceCode,
    excludeIdentityDocuments: excludeIdentity,
    sender: {
      fullName:
        (senderData.fullName as string) ||
        (senderData.name as string) ||
        (fullBooking.customer_name as string) ||
        '',
      completeAddress:
        (senderData.completeAddress as string) ||
        (senderData.address as string) ||
        (fullBooking.sender_address as string) ||
        '',
      contactNo:
        (senderData.contactNo as string) ||
        (senderData.phone as string) ||
        (senderData.phoneNumber as string) ||
        '',
      emailAddress:
        (senderData.emailAddress as string) || (senderData.email as string) || '',
      agentName: (senderData.agentName as string) || '',
      deliveryOption:
        senderDeliveryOption === 'pickup' || senderDeliveryOption === 'warehouse'
          ? senderDeliveryOption
          : 'warehouse',
    },
    receiver: {
      fullName:
        (receiverData.fullName as string) ||
        (receiverData.name as string) ||
        (fullBooking.receiver_name as string) ||
        '',
      completeAddress:
        (receiverData.completeAddress as string) ||
        (receiverData.address as string) ||
        (fullBooking.receiver_address as string) ||
        '',
      contactNo:
        (receiverData.contactNo as string) ||
        (receiverData.phone as string) ||
        (receiverData.phoneNumber as string) ||
        '',
      emailAddress:
        (receiverData.emailAddress as string) || (receiverData.email as string) || '',
      deliveryOption: normalizeReceiverDeliveryOptionForPdf(receiverDeliveryOption),
      numberOfBoxes:
        (fullBooking.number_of_boxes as number) ||
        (fullBooking.numberOfBoxes as number) ||
        undefined,
    },
    items: pdfItems,
    submissionTimestamp:
      (fullBooking.createdAt as string) ||
      (fullBooking.created_at as string) ||
      undefined,
    declarationText:
      (fullBooking.declarationText as string) ||
      (fullBooking.declaration_text as string) ||
      undefined,
    insured: !!(fullBooking.insured || fullBooking.isInsured),
    declaredAmount: parseDeclaredAmountFromBooking(fullBooking),
    uaePassUserInfo: pickUaePassUserInfoFromBooking(fullBooking),
  };

  if (!excludeIdentity) {
    const allCustomerImages: string[] = [];
    if (Array.isArray(idDocs.customerImages)) {
      allCustomerImages.push(...(idDocs.customerImages as string[]));
    }
    if (Array.isArray(fullBooking.customerImages)) {
      allCustomerImages.push(...(fullBooking.customerImages as string[]));
    }
    const singularCustomerImage =
      (idDocs.customerImage as string) || (fullBooking.customerImage as string);
    const customerImages =
      singularCustomerImage && !allCustomerImages.includes(singularCustomerImage)
        ? [...allCustomerImages, singularCustomerImage]
        : allCustomerImages.filter(Boolean);

    pdfData.eidFrontImage = getImageSrc(
      (idDocs.eidFrontImage as string) || (fullBooking.id_front_image as string)
    );
    pdfData.eidBackImage = getImageSrc(
      (idDocs.eidBackImage as string) || (fullBooking.id_back_image as string)
    );
    pdfData.philippinesIdFront = getImageSrc(
      (idDocs.philippinesIdFront as string) || (fullBooking.philippinesIdFront as string)
    );
    pdfData.philippinesIdBack = getImageSrc(
      (idDocs.philippinesIdBack as string) || (fullBooking.philippinesIdBack as string)
    );
    pdfData.confirmationForm = idDocs.confirmationForm as string | undefined;
    pdfData.tradeLicense = idDocs.tradeLicense as string | undefined;
    pdfData.customerImage = customerImages.length > 0 ? customerImages[0] : undefined;
    pdfData.customerImages = customerImages.length > 0 ? customerImages : undefined;
  }

  return pdfData;
}

export async function downloadBookingFormPdf(
  fullBooking: Record<string, unknown>,
  options: MapBookingPdfOptions = { excludeIdentityDocuments: true }
): Promise<void> {
  const pdfData = mapBookingRecordToPdfData(fullBooking, options);
  await generateBookingPDF(pdfData);
}
