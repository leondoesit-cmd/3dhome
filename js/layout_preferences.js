export const LAYOUT_ACCESS=Object.freeze({bed:60,wardrobe:80,sofa:60,desk:80,chair:60,fridge:90,table:60,sink:80,cooktop:80,toilet:60,shower:60,washer:90});
export const LAYOUT_TYPES=Object.freeze(Object.keys(LAYOUT_ACCESS));
export function defaultRequiredItems(type){
 const defaults={bedroom:['bed'],masterBedroom:['bed'],kidsRoom:['bed'],office:['desk'],closet:['wardrobe'],kitchen:['fridge','sink','cooktop'],livingKitchen:['sofa','fridge','sink'],dining:['table'],bathroom:['toilet','shower','sink'],ensuite:['toilet','shower','sink'],wc:['toilet','sink'],laundry:['washer'],living:['sofa'],balcony:['chair'],terrace:['table']};
 return [...(defaults[type]||[])];
}
