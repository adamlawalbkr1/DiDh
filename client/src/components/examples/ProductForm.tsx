import ProductForm from '../ProductForm';

export default function ProductFormExample() {
  return (
    <div className="w-full max-w-2xl">
      <ProductForm
        onSubmit={(data) => console.log('Product submitted:', data)}
        onCancel={() => console.log('Form cancelled')}
        suggestedPrice="1149.00"
        isGeneratingPrice={false}
      />
    </div>
  );
}