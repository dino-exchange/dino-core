// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import '../DinoBEP20.sol';

contract MockBEP20 is DinoBEP20 {
    constructor(uint256 _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
