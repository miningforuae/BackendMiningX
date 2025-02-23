miningMachineSchema.pre('save', function(next) {
    if (this.isShareBased) {
      // Validate total shares calculation
      const expectedTotalShares = Math.floor(this.priceRange / this.sharePrice);
      if (expectedTotalShares !== this.totalShares) {
        next(new Error('Invalid share configuration'));
      }
      
      // Validate profit per share
      const expectedProfitPerShare = this.monthlyProfit / this.totalShares;
      if (Math.abs(expectedProfitPerShare - this.profitPerShare) > 0.01) {
        next(new Error('Invalid profit per share configuration'));
      }
    }
    next();
  });
  
  // Add helper methods for share calculations
  miningMachineSchema.methods.calculateAvailableShares = function() {
    return this.availableShares;
  };
  
  miningMachineSchema.methods.calculateShareValue = function(numberOfShares) {
    return numberOfShares * this.sharePrice;
  };
  
  miningMachineSchema.methods.calculateMonthlyProfit = function(numberOfShares) {
    return numberOfShares * this.profitPerShare;
  };