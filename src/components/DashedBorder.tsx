const DashedBorder = () => {
  return (
    <div
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3cline x1='0' y1='50%25' x2='100%25' y2='50%25' stroke='%23D4D4D4' stroke-width='1' stroke-dasharray='8%2c 8'/%3e%3c/svg%3e\")",
      }}
      className="w-full h-0.5"
    />
  );
};

export default DashedBorder;
